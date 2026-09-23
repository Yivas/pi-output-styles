import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { vi, describe, expect, it, afterEach } from "vitest";

const mockedAgentDirectory = vi.hoisted(() => ({ path: "" }));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, getAgentDir: () => mockedAgentDirectory.path };
});

import extension from "../../src/extension.js";
import { STYLE_CONTROLLER_CHANNEL, STYLE_CONTROLLER_REQUEST_CHANNEL } from "../../src/interop.js";
import { ForcedStyleController } from "../../src/styles/forced.js";
import {
  createEventBus,
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  SessionManager,
  type BuildSystemPromptOptions,
  type ExtensionActions,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContextActions,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";

const temporaryDirectories: string[] = [];
const originalAgentDirectory = process.env.PI_CODING_AGENT_DIR;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

afterEach(async () => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;
  mockedAgentDirectory.path = "";
  if (originalAgentDirectory === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalAgentDirectory;
  }
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

type RegisteredHandler = (event: unknown, context: unknown) => unknown;

function createExtensionApi() {
  const handlers = new Map<string, RegisteredHandler>();
  const commands = new Map<string, { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }>();
  const api = {
    on(event: string, handler: RegisteredHandler) {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    registerCommand(name: string, command: { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }) {
      commands.set(name, command);
    },
    events: createEventBus(),
  } as unknown as ExtensionAPI;
  return { api, handlers, commands };
}

function commandContext(notify = vi.fn()): ExtensionCommandContext {
  return { hasUI: true, ui: { notify } } as unknown as ExtensionCommandContext;
}

async function startExtension(agentDirectory: string) {
  mockedAgentDirectory.path = agentDirectory;
  const extensionApi = createExtensionApi();
  await extension(extensionApi.api);
  return extensionApi;
}

describe("extension factory", () => {
  it("loads, changes, and restores the selected style across extension instances", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-extension-"));
    temporaryDirectories.push(agentDirectory);

    const first = await startExtension(agentDirectory);
    const firstCommand = first.commands.get("output-style");
    expect(firstCommand).toBeDefined();

    const initial = await first.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(initial).toEqual({
      systemPrompt: "Native instructions",
    });

    await firstCommand?.handler("Concise", commandContext());
    const changed = await first.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(changed).toEqual({
      systemPrompt: expect.stringContaining("## Output style: Concise"),
    });

    const restarted = await startExtension(agentDirectory);
    const restored = await restarted.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(restored).toEqual({
      systemPrompt: expect.stringContaining("## Output style: Concise"),
    });
  });

  it("runs the factory through Pi's real ExtensionRunner", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-real-runner-"));
    temporaryDirectories.push(agentDirectory);
    mockedAgentDirectory.path = agentDirectory;

    const cwd = agentDirectory;
    process.env.PI_CODING_AGENT_DIR = agentDirectory;
    const loaded = await discoverAndLoadExtensions(
      [fileURLToPath(new URL("../../src/extension.ts", import.meta.url))],
      cwd,
      agentDirectory,
      createEventBus(),
    );
    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      new ModelRegistry({} as unknown as ModelRuntime),
    );
    runner.bindCore(
      {
        sendMessage: () => {},
        sendUserMessage: () => {},
        appendEntry: () => {},
        setSessionName: () => {},
        getSessionName: () => undefined,
        setLabel: () => {},
        getLabel: () => undefined,
        setActiveTools: () => {},
        getActiveTools: () => [],
        getAllTools: () => [],
        refreshTools: () => {},
        getCommands: () => [],
        setModel: async () => false,
        getThinkingLevel: () => "off",
        setThinkingLevel: () => {},
      } as ExtensionActions,
      {
        getModel: () => undefined,
        getScopedModels: () => [],
        isIdle: () => true,
        isProjectTrusted: () => true,
        getSignal: () => undefined,
        abort: () => {},
        hasPendingMessages: () => false,
        shutdown: () => {},
        getContextUsage: () => undefined,
        compact: () => {},
        getSystemPrompt: () => "Native instructions",
        getSystemPromptOptions: () => ({ cwd }),
      } as ExtensionContextActions,
    );

    const command = runner.getCommand("output-style");
    expect(command).toBeDefined();
    await command?.handler("Concise", runner.createCommandContext());

    const promptOptions: BuildSystemPromptOptions = { cwd, customPrompt: "Native instructions" };
    const result = await runner.emitBeforeAgentStart("probe", undefined, promptOptions);
    expect(result.systemPromptOptions.forceSystemPrompt).toContain("Native instructions");
    expect(result.systemPromptOptions.forceSystemPrompt).toContain("## Output style: Concise");
  });

  it("falls back to default and reports a visible error when persistence cannot be read or written", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-extension-error-"));
    temporaryDirectories.push(parentDirectory);
    const agentDirectory = join(parentDirectory, "agent");
    await mkdir(agentDirectory);
    await mkdir(join(agentDirectory, "pi-output-styles.selection.json"));

    const extensionApi = await startExtension(agentDirectory);
    const notify = vi.fn();
    await extensionApi.handlers.get("session_start")?.({}, { hasUI: true, ui: { notify } });

    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Could not read selection file/i), "error");
    const beforeWrite = await extensionApi.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(beforeWrite).toEqual({
      systemPrompt: "Native instructions",
    });

    const command = extensionApi.commands.get("output-style");
    await command?.handler("Concise", commandContext(notify));

    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Could not persist output style/i), "error");
    const afterWrite = await extensionApi.handlers.get("before_agent_start")?.({
      systemPrompt: "Native instructions",
    }, {});
    expect(afterWrite).toEqual({
      systemPrompt: "Native instructions",
    });
  });
});

function fakeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/]`,
  };
}

describe("status indicator wiring", () => {
  it("paints the effective style on session_start in TUI mode", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-indicator-"));
    temporaryDirectories.push(agentDirectory);
    const extensionApi = await startExtension(agentDirectory);
    const setStatus = vi.fn();

    await extensionApi.handlers.get("session_start")?.({}, {
      mode: "tui",
      hasUI: true,
      ui: { notify: vi.fn(), setStatus, theme: fakeTheme() },
    });

    expect(setStatus).toHaveBeenCalledWith("pi-output-styles", "[muted]style: default[/]");
  });

  it("shows default in the indicator and keeps the visible error for an unknown persisted selection", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-indicator-fallback-"));
    temporaryDirectories.push(agentDirectory);
    await writeFile(
      join(agentDirectory, "pi-output-styles.selection.json"),
      `${JSON.stringify({ selectedStyle: "ghost" }, null, 2)}\n`,
    );
    const extensionApi = await startExtension(agentDirectory);
    const setStatus = vi.fn();
    const notify = vi.fn();

    await extensionApi.handlers.get("session_start")?.({}, {
      mode: "tui",
      hasUI: true,
      ui: { notify, setStatus, theme: fakeTheme() },
    });

    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/unknown output style: ghost/i), "error");
    expect(setStatus).toHaveBeenCalledWith("pi-output-styles", "[muted]style: default[/]");
  });

  it("leaves the status bar untouched outside TUI mode", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-indicator-rpc-"));
    temporaryDirectories.push(agentDirectory);
    const extensionApi = await startExtension(agentDirectory);
    const setStatus = vi.fn();

    await extensionApi.handlers.get("session_start")?.({}, {
      mode: "rpc",
      hasUI: true,
      ui: { notify: vi.fn(), setStatus },
    });

    expect(setStatus).not.toHaveBeenCalled();
  });
});

describe("custom style load warnings", () => {
  it("reports a malformed style file and a project-over-user collision at session start", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "pi-output-styles-load-warnings-"));
    temporaryDirectories.push(projectRoot);
    const agentDirectory = join(projectRoot, ".pi", "agent");
    await mkdir(join(agentDirectory, "output-styles"), { recursive: true });
    await mkdir(join(projectRoot, ".pi", "output-styles"), { recursive: true });
    await writeFile(join(projectRoot, ".pi", "output-styles", "Broken.md"), "not a style file\n");
    const frontmatter = "---\nname: Team\ndescription: Team response guidance.\nkeep-coding-instructions: false\n---\nUse team guidance.\n";
    await writeFile(join(agentDirectory, "output-styles", "Team.md"), frontmatter);
    await writeFile(join(projectRoot, ".pi", "output-styles", "Team.md"), frontmatter);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(projectRoot);

    const extensionApi = await startExtension(agentDirectory);
    const notify = vi.fn();
    await extensionApi.handlers.get("session_start")?.({}, { hasUI: true, ui: { notify } });

    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/Could not load custom style .*Broken\.md/i),
      "error",
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/Style collision for team: user is overridden by project/i),
      "error",
    );
  });
});

describe("forced style in the menu", () => {
  it("renders the force banner from the controller delivered over the product's event bus", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-force-banner-"));
    temporaryDirectories.push(agentDirectory);
    const extensionApi = await startExtension(agentDirectory);

    let controller: ForcedStyleController | undefined;
    extensionApi.api.events.on(STYLE_CONTROLLER_CHANNEL, (payload: unknown) => {
      controller = payload as ForcedStyleController;
    });
    extensionApi.api.events.emit(STYLE_CONTROLLER_REQUEST_CHANNEL, undefined);
    expect(controller).toBeDefined();
    controller?.force("plugin-a", "concise");

    let rendered = "";
    const custom = vi.fn(async (factory: (
      tui: unknown,
      theme: unknown,
      keybindings: unknown,
      done: (result: string | null) => void,
    ) => { render(width: number): string[] }) => {
      const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, {
        fg: (color: string, text: string) => `[${color}]${text}[/]`,
      }, {}, () => null);
      rendered = component.render(120).join("\n");
      return null;
    });
    const notify = vi.fn();
    const context = {
      mode: "tui",
      hasUI: true,
      ui: { notify, custom, setStatus: vi.fn(), theme: { fg: (c: string, t: string) => `[${c}]${t}[/]` } },
    } as never;

    const command = extensionApi.commands.get("output-style");
    await command?.handler("", context);

    expect(rendered).toContain("Forced by plugin-a — selection overridden");
  });
});
