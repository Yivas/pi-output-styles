import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createEventBus,
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  SessionManager,
  type ExtensionActions,
  type ExtensionContextActions,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { createBuiltinRegistry } from "../../src/styles/registry.js";
import { createTransportCapture, type TransportPayload } from "../fixtures/transport-capture.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const directories = temporaryDirectories.splice(0);
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("system prompt transport boundary", () => {
  it("exposes the composed prompt through context and the simulated transport", async () => {
    const cwd = process.cwd();
    const extensionDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-transport-"));
    temporaryDirectories.push(extensionDirectory);
    const extensionPath = join(extensionDirectory, "transport-extension.ts");
    const promptModule = pathToFileURL(join(cwd, "src/prompt.ts")).href;
    const registryModule = pathToFileURL(join(cwd, "src/styles/registry.ts")).href;
    await writeFile(
      extensionPath,
      `import { registerSystemPromptHook } from ${JSON.stringify(promptModule)};
import { createBuiltinRegistry } from ${JSON.stringify(registryModule)};
export default function (pi) {
  registerSystemPromptHook(pi, createBuiltinRegistry(), () => "concise");
}
`,
    );

    const eventBus = createEventBus();
    const loaded = await discoverAndLoadExtensions(
      [extensionPath],
      cwd,
      cwd,
      eventBus,
    );
    const transport = createTransportCapture();
    const style = createBuiltinRegistry().resolve("concise");
    if (!style) {
      throw new Error("Concise built-in style is missing");
    }

    const sessionManager = SessionManager.inMemory(cwd);
    const modelRegistry = new ModelRegistry({} as unknown as ModelRuntime);
    const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, sessionManager, modelRegistry);
    let currentSystemPrompt = "native instructions";

    runner.bindCore(
      {
        sendMessage: () => {},
        sendUserMessage: () => {},
        appendEntry: () => {},
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
        getSystemPrompt: () => currentSystemPrompt,
        getSystemPromptOptions: () => ({ cwd }),
      } as ExtensionContextActions,
    );

    const result = await runner.emitBeforeAgentStart("Summarize the change", undefined, {
      cwd,
      customPrompt: currentSystemPrompt,
    });
    currentSystemPrompt = result.systemPromptOptions.forceSystemPrompt ?? currentSystemPrompt;

    const payload: TransportPayload = {
      messages: [
        { role: "system", content: currentSystemPrompt },
        { role: "user", content: "Summarize the change" },
      ],
    };
    const finalPayload = await runner.emitBeforeProviderRequest(payload);
    transport.observe(finalPayload as TransportPayload);

    const capturedPayload = transport.read();
    const capturedJson = JSON.stringify(capturedPayload);
    const styleInstructions = style.instructions;

    expect(runner.createContext().getSystemPrompt()).toBe(currentSystemPrompt);
    expect(capturedPayload.messages[0]?.content).toContain("native instructions");
    expect(capturedPayload.messages[0]?.content).toContain(styleInstructions);
    expect(capturedJson.split(styleInstructions).length - 1).toBe(1);
    expect(capturedJson.split("native instructions").length - 1).toBe(1);
  });
});
