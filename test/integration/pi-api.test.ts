import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createEventBus,
  ExtensionRunner,
  getAgentDir,
  discoverAndLoadExtensions,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  VERSION as piVersion,
  type BuildSystemPromptOptions,
  type ExtensionActions,
  type ExtensionContextActions,
  type ExtensionUIContext,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PI_PACKAGE_DIR = `${process.cwd()}/node_modules/@earendil-works/pi-coding-agent`;
});

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "pi-output-styles-"));
  temporaryDirectories.push(directory);
  return directory;
}

type CapabilityStatus = "yes" | "no" | "not checked";

const capabilityMatrix: ReadonlyArray<{
  capability: string;
  status: CapabilityStatus;
  signature: string;
  evidence: string;
}> = [
  {
    capability: "before_agent_start event and result",
    status: "yes",
    signature: 'BeforeAgentStartEvent { systemPrompt: readonly string; systemPromptOptions: NormalizedBuildSystemPromptOptions }; BeforeAgentStartEventResult { message?; systemPrompt? }',
    evidence: "dist/core/extensions/types.d.ts:555-565, 917-921; docs/extensions.md:535-573",
  },
  {
    capability: "before_agent_start chaining",
    status: "yes",
    signature: "ExtensionRunner.emitBeforeAgentStart(prompt, images, systemPromptOptions): Promise<{ messages; systemPromptOptions }>",
    evidence: "dist/core/extensions/runner.d.ts:175-176; docs/extensions.md:543-573",
  },
  {
    capability: "pi.registerCommand and non-UI modes",
    status: "yes",
    signature: 'registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void; ExtensionMode = "tui" | "rpc" | "json" | "print"',
    evidence: "dist/core/extensions/types.d.ts:1020-1022, 1059-1060; docs/extensions.md:1628-1665 and 1020-1031",
  },
  {
    capability: "appendEntry persistence",
    status: "yes",
    signature: "appendEntry<T = unknown>(customType: string, data?: T): void",
    evidence: "dist/core/extensions/types.d.ts:1059-1060; docs/extensions.md:1574-1592; probe test captures the entry",
  },
  {
    capability: "ctx.getSystemPrompt",
    status: "yes",
    signature: "getSystemPrompt(): string",
    evidence: "dist/core/extensions/types.d.ts:239-241; docs/extensions.md:1187-1199",
  },
  {
    capability: "ctx.sessionManager",
    status: "yes",
    signature: "sessionManager: ReadonlySessionManager",
    evidence: "dist/core/extensions/types.d.ts:224-225; docs/extensions.md:1020-1090",
  },
  {
    capability: "public writer for a custom settings namespace",
    status: "no",
    signature: "SettingsManager.create(cwd, agentDir?, options?) and named setters only; no generic namespace writer",
    evidence: "dist/index.d.ts:2,21; dist/core/settings-manager.d.ts:136-204, 211-214; probe shows unknown namespaces survive a named write but cannot be written through the public API",
  },
  {
    capability: "locking settings storage",
    status: "yes",
    signature: "SettingsStorage.withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void",
    evidence: "dist/core/settings-manager.d.ts:136-149; SettingsManager.create is public at dist/core/settings-manager.d.ts:172-175",
  },
  {
    capability: "turn start and turn end hooks",
    status: "yes",
    signature: 'on("turn_start", handler) and on("turn_end", handler): () => void',
    evidence: "dist/core/extensions/types.d.ts:1004-1005, 649-656; docs/extensions.md:626-661",
  },
  {
    capability: "final idle hook after automatic work",
    status: "yes",
    signature: 'on("agent_settled", handler): () => void; ctx.isIdle(): boolean',
    evidence: "dist/core/extensions/types.d.ts:1000-1001, 624-626; docs/extensions.md:575-606 and 1138-1140",
  },
  {
    capability: "dedicated hook for only waiting on background work",
    status: "no",
    signature: "No dedicated background-wait lifecycle event is declared",
    evidence: "complete event union in dist/core/extensions/types.d.ts:879 and lifecycle list in docs/extensions.md:275-317; cache_warming_decision is cache-specific",
  },
  {
    capability: "cache warming decision hook",
    status: "yes",
    signature: 'on("cache_warming_decision", handler): () => void',
    evidence: "dist/core/extensions/types.d.ts:993; docs/extensions.md:805-807",
  },
];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Pi extension API probe", () => {
  it("records the capability matrix for the installed Pi version", () => {
    expect(piVersion).toBe("0.87.0");
    expect(capabilityMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "before_agent_start event and result", status: "yes" }),
      expect.objectContaining({ capability: "public writer for a custom settings namespace", status: "no" }),
      expect.objectContaining({ capability: "dedicated hook for only waiting on background work", status: "no" }),
    ]));
  });

  it("registers a command, chains system prompts, and appends session state", async () => {
    const cwd = await createTemporaryDirectory();
    const eventBus = createEventBus();
    const earlierExtensionPath = join(cwd, "earlier-extension.ts");
    const styleProbeExtensionPath = join(cwd, "style-probe-extension.ts");
    await writeFile(
      earlierExtensionPath,
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: event.systemPrompt + "\\n\\nEarlier extension instructions",
  }));
}
`,
    );
    await writeFile(
      styleProbeExtensionPath,
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => ({
    systemPrompt: event.systemPrompt + "\\n\\nProbe style instructions\\n\\nContext prompt: " + ctx.getSystemPrompt(),
  }));
  pi.registerCommand("output-style-probe", {
    description: "Probe command registration",
    handler: async () => {},
  });
}
`,
    );

    const loaded = await discoverAndLoadExtensions(
      [earlierExtensionPath, styleProbeExtensionPath],
      cwd,
      cwd,
      eventBus,
    );
    const extensions = loaded.extensions;
    const sessionManager = SessionManager.inMemory(cwd);
    const modelRegistry = new ModelRegistry({} as unknown as ModelRuntime);
    const runner = new ExtensionRunner(extensions, loaded.runtime, cwd, sessionManager, modelRegistry);
    const persistedEntries: Array<{ customType: string; data: unknown }> = [];

    runner.bindCore(
      {
        sendMessage: () => {},
        sendUserMessage: () => {},
        appendEntry: (customType, data) => persistedEntries.push({ customType, data }),
        setSessionName: () => {},
        getSessionName: () => undefined,
        setLabel: () => {},
        getActiveTools: () => [],
        getAllTools: () => [],
        setActiveTools: () => {},
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
        getSystemPrompt: () => "native prompt",
        getSystemPromptOptions: () => ({ cwd }),
      } as ExtensionContextActions,
    );

    loaded.runtime.appendEntry("pi-output-styles-probe", { selectedStyle: "concise" });
    const basePromptOptions: BuildSystemPromptOptions = { cwd, customPrompt: "native prompt" };
    const result = await runner.emitBeforeAgentStart("probe", undefined, basePromptOptions);

    expect(piVersion).toBe("0.87.0");
    expect(runner.getRegisteredCommands().map((command) => command.name)).toContain("output-style-probe");
    const forcedPrompt = result.systemPromptOptions.forceSystemPrompt;
    expect(forcedPrompt).toContain("native prompt");
    expect(forcedPrompt).toContain("Earlier extension instructions");
    expect(forcedPrompt).toContain("Probe style instructions");
    expect(forcedPrompt).toContain("Context prompt: native prompt");
    expect(persistedEntries).toEqual([
      { customType: "pi-output-styles-probe", data: { selectedStyle: "concise" } },
    ]);
  });

  it("registers and dispatches turn lifecycle callbacks without a provider", async () => {
    const cwd = await createTemporaryDirectory();
    const extensionPath = join(cwd, "turn-hooks-extension.ts");
    await writeFile(
      extensionPath,
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("turn_start", (event, ctx) => {
    ctx.ui.notify("turn_start:" + event.turnIndex, "info");
  });
  pi.on("agent_settled", (_event, ctx) => {
    ctx.ui.notify("agent_settled", "info");
  });
}
`,
    );

    const loaded = await discoverAndLoadExtensions([extensionPath], cwd, cwd, createEventBus());
    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      new ModelRegistry({} as unknown as ModelRuntime),
    );
    const notifications: string[] = [];
    runner.setUIContext({
      notify: (message: string) => notifications.push(message),
    } as unknown as ExtensionUIContext, "print");
    runner.bindCore({} as ExtensionActions, {
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
      getSystemPrompt: () => "native prompt",
      getSystemPromptOptions: () => ({ cwd }),
    } as ExtensionContextActions);

    await runner.emit({ type: "turn_start", turnIndex: 2, timestamp: 123 });
    await runner.emit({ type: "agent_settled" });

    expect(notifications).toEqual(["turn_start:2", "agent_settled"]);
  });

  it("keeps style-looking prompt content opaque at the Pi hook boundary", async () => {
    const cwd = await createTemporaryDirectory();
    const extensionPath = join(cwd, "opaque-style-extension.ts");
    const body = "const request = fetch('https://example.invalid/telemetry');";
    await writeFile(
      extensionPath,
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: event.systemPrompt + "\\n\\n${body}",
  }));
}
`,
    );

    const loaded = await discoverAndLoadExtensions([extensionPath], cwd, cwd, createEventBus());
    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      new ModelRegistry({} as unknown as ModelRuntime),
    );
    runner.bindCore({} as ExtensionActions, {
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
      getSystemPrompt: () => "native prompt",
      getSystemPromptOptions: () => ({ cwd }),
    } as ExtensionContextActions);

    const result = await runner.emitBeforeAgentStart(
      "probe",
      undefined,
      { cwd, customPrompt: "native prompt" },
    );
    expect(result.systemPromptOptions.forceSystemPrompt).toContain(body);
  });

  it("writes through the public settings manager while preserving unknown namespaces", async () => {
    const cwd = await createTemporaryDirectory();
    const agentDir = join(cwd, "agent");
    await mkdir(agentDir, { recursive: true });
    const settingsPath = join(agentDir, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          untouchedField: "preserve me",
          "pi-output-styles": { selected: "concise" },
        },
        null,
        2,
      ),
    );

    const settings = SettingsManager.create(cwd, agentDir);
    const settingsSurface = {
      hasGlobalSettingsReader: typeof settings.getGlobalSettings === "function",
      hasGenericWriter: "set" in settings || "setSetting" in settings || "update" in settings,
      installedAgentDirectory: getAgentDir().length > 0,
    };
    settings.setTheme("light");
    await settings.flush();

    const savedSettings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    expect(settingsSurface).toEqual({
      hasGlobalSettingsReader: true,
      hasGenericWriter: false,
      installedAgentDirectory: true,
    });
    expect(savedSettings).toMatchObject({
      untouchedField: "preserve me",
      "pi-output-styles": { selected: "concise" },
      theme: "light",
    });
  });
});
