import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedAgentDirectory = vi.hoisted(() => ({ path: "" }));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, getAgentDir: () => mockedAgentDirectory.path };
});

import extension, { createForcedStyleController } from "../../src/extension.js";
import { registerSystemPromptHook } from "../../src/prompt.js";
import { createSelectionStore } from "../../src/settings.js";
import { discoverStyleFiles } from "../../src/styles/discovery.js";
import { loadCustomStyles } from "../../src/styles/custom-loader.js";
import { mergeStyleSources } from "../../src/styles/merge.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";

type RegisteredHandler = (event: unknown, context: unknown) => unknown;

const temporaryDirectories: string[] = [];
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

afterEach(async () => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;
  mockedAgentDirectory.path = "";
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function createExtensionApi() {
  const handlers = new Map<string, RegisteredHandler>();
  const commands = new Map<string, RegisteredCommand>();
  const api = {
    on(event: string, handler: RegisteredHandler) {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) {
      commands.set(name, { name, sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options });
    },
    events: createEventBus(),
  } as unknown as ExtensionAPI;
  return { api, handlers, commands };
}

function commandContext(notify = vi.fn()): ExtensionCommandContext {
  return { hasUI: true, ui: { notify } } as unknown as ExtensionCommandContext;
}

async function createStyleProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-output-styles-custom-pipeline-"));
  temporaryDirectories.push(projectRoot);
  const agentDirectory = join(projectRoot, ".pi", "agent");
  await mkdir(join(agentDirectory, "output-styles"), { recursive: true });
  await mkdir(join(projectRoot, ".pi", "output-styles"), { recursive: true });
  await mkdir(join(projectRoot, "output-styles"), { recursive: true });
  await writeFile(
    join(projectRoot, "output-styles", "Ignored.md"),
    "---\nname: Ignored Style\ndescription: Must not load.\nkeep-coding-instructions: false\n---\nIgnored body.\n",
  );

  await writeFile(
    join(agentDirectory, "output-styles", "Concise.md"),
    "---\nname: User Concise\ndescription: User replacement.\nkeep-coding-instructions: true\n---\nUser collision body.\n",
  );
  await writeFile(
    join(agentDirectory, "output-styles", "UserOnly.md"),
    "---\nname: User Only\ndescription: User-only style.\nkeep-coding-instructions: true\n---\nUser-only body.\n",
  );
  await writeFile(
    join(projectRoot, ".pi", "output-styles", "Concise.md"),
    "---\nname: Project Concise\ndescription: Project replacement.\nkeep-coding-instructions: false\n---\nProject collision body.\n",
  );
  await writeFile(
    join(projectRoot, ".pi", "output-styles", "ProjectOnly.md"),
    "---\nname: Project Only\ndescription: Project-only style.\nkeep-coding-instructions: true\n---\nProject-only body.\n",
  );

  return { projectRoot, agentDirectory };
}

describe("custom style pipeline", () => {
  it("loads both sources, resolves collisions, restores persisted selection, and keeps warnings body-free", async () => {
    const { projectRoot, agentDirectory } = await createStyleProject();
    mockedAgentDirectory.path = agentDirectory;
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(projectRoot);

    await createSelectionStore(agentDirectory).write("concise");
    const extensionApi = createExtensionApi();
    await extension(extensionApi.api);

    const startupNotify = vi.fn();
    await extensionApi.handlers.get("session_start")?.({}, {
      hasUI: true,
      ui: { notify: startupNotify },
    });
    expect(startupNotify).toHaveBeenCalledWith(expect.stringContaining("built-in is overridden by user"), "error");
    expect(startupNotify).toHaveBeenCalledWith(expect.stringContaining("user is overridden by project"), "error");
    expect(startupNotify.mock.calls.map(([message]) => message).join("\n")).not.toContain("Project collision body.");
    expect(startupNotify.mock.calls.map(([message]) => message).join("\n")).not.toContain("User collision body.");

    const notify = vi.fn();
    const command = extensionApi.commands.get("output-style");
    expect(command).toBeDefined();
    await command?.handler("list", commandContext(notify));
    const listing = notify.mock.calls[0]?.[0] as string;
    expect(listing).toContain("Project Concise");
    expect(listing).toContain("[project]");
    expect(listing).toContain("User Only");
    expect(listing).toContain("Project Only");
    expect(listing).not.toContain("User Concise");
    expect(listing).not.toContain("Ignored Style");

    const restored = await extensionApi.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(restored).toEqual({
      systemPrompt: expect.stringContaining("Project collision body."),
    });
    expect(restored).toEqual({
      systemPrompt: expect.not.stringContaining("User collision body."),
    });

    await command?.handler("UserOnly", commandContext(notify));
    await expect(readFile(join(agentDirectory, "pi-output-styles.selection.json"), "utf8"))
      .resolves.toContain('"selectedStyle": "useronly"');
    const changed = await extensionApi.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(changed).toEqual({
      systemPrompt: expect.stringContaining("User-only body."),
    });
  });

  it("applies the first valid force to the merged custom registry and restores selection after release", async () => {
    const { projectRoot } = await createStyleProject();
    const discovered = discoverStyleFiles(projectRoot, projectRoot);
    const loaded = loadCustomStyles(discovered);
    const merged = mergeStyleSources(
      createBuiltinRegistry(),
      loaded.styles.filter((style) => style.source === "user"),
      loaded.styles.filter((style) => style.source === "project"),
    );
    const warning = vi.fn();
    const controller = createForcedStyleController(merged.registry, warning);
    const handlers = new Map<string, RegisteredHandler>();
    const api = {
      on(event: string, handler: RegisteredHandler) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    } as unknown as ExtensionAPI;
    registerSystemPromptHook(api, merged.registry, () => controller.resolve("user-only"));

    const first = controller.force("plugin-a", "projectonly");
    controller.force("plugin-b", "useronly");
    const forced = await handlers.get("before_agent_start")?.({ systemPrompt: "Native instructions" }, {});

    expect(forced).toEqual({
      systemPrompt: expect.stringContaining("Project-only body."),
    });
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({
      code: "force-conflict",
      firstPluginId: "plugin-a",
      pluginId: "plugin-b",
    }));

    first.release();
    const restored = await handlers.get("before_agent_start")?.({ systemPrompt: "Native instructions" }, {});
    expect(restored).toEqual({
      systemPrompt: expect.stringContaining("User-only body."),
    });
  });
});
