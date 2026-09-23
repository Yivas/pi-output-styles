import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedAgentDirectory = vi.hoisted(() => ({ path: "" }));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, getAgentDir: () => mockedAgentDirectory.path };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import extension from "../../src/extension.js";

const temporaryDirectories: string[] = [];
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

afterEach(async () => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;
  mockedAgentDirectory.path = "";
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

type RegisteredHandler = (event: unknown, context: unknown) => unknown;

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

async function createProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-output-styles-custom-selection-"));
  temporaryDirectories.push(projectRoot);
  const agentDirectory = join(projectRoot, ".pi", "agent");
  await mkdir(join(agentDirectory, "output-styles"), { recursive: true });
  await mkdir(join(projectRoot, ".pi", "output-styles"), { recursive: true });
  await writeFile(
    join(agentDirectory, "output-styles", "User.md"),
    "---\nname: User Style\ndescription: User response guidance.\nkeep-coding-instructions: true\n---\nUse user response guidance.\n",
  );
  await writeFile(
    join(projectRoot, ".pi", "output-styles", "Project.md"),
    "---\nname: Project Style\ndescription: Project response guidance.\nkeep-coding-instructions: false\n---\nUse project response guidance.\n",
  );
  return { projectRoot, agentDirectory };
}

describe("custom style selection", () => {
  it("lists origins and applies a selected custom style on the next prompt", async () => {
    const { projectRoot, agentDirectory } = await createProject();
    mockedAgentDirectory.path = agentDirectory;
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(projectRoot);

    const extensionApi = createExtensionApi();
    await extension(extensionApi.api);

    const notify = vi.fn();
    const command = extensionApi.commands.get("output-style");
    await command?.handler("list", commandContext(notify));

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("default"), "info");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Project Style"), "info");
    expect(notify.mock.calls[0]?.[0]).toContain("Project response guidance.");
    expect(notify.mock.calls[0]?.[0]).toMatch(/Project Style.*project/i);
    expect(notify.mock.calls[0]?.[0]).toMatch(/User Style.*user/i);

    await command?.handler("Project", commandContext(notify));
    const result = await extensionApi.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});

    expect(result).toEqual({
      systemPrompt: expect.stringContaining("## Output style: Project Style"),
    });
    expect(result).toEqual({
      systemPrompt: expect.stringContaining("Use project response guidance."),
    });
  });
});
