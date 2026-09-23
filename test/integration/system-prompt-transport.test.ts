import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { composeStylePrompt } from "../../src/prompt.js";
import { BASE_CODING_INSTRUCTIONS } from "../../src/styles/coding-instructions.js";
import { parseStyleFile } from "../../src/styles/parser.js";
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
    const serializedInstructions = JSON.stringify(styleInstructions).slice(1, -1);

    expect(runner.createContext().getSystemPrompt()).toBe(currentSystemPrompt);
    expect(capturedPayload.messages[0]?.content).toContain("native instructions");
    expect(capturedPayload.messages[0]?.content).toContain(styleInstructions);
    expect(capturedJson.split(serializedInstructions).length - 1).toBe(1);
    expect(capturedJson.split("native instructions").length - 1).toBe(1);
  });

  it("preserves native instructions while transporting the owned coding block by style", async () => {
    const fixturesDirectory = fileURLToPath(new URL("../fixtures/styles/", import.meta.url));
    const chainedPrompt = "native instructions\n\nproject instructions";

    for (const fixtureName of ["keep-coding-true.md", "keep-coding-false.md"] as const) {
      const style = parseStyleFile(
        await readFile(join(fixturesDirectory, fixtureName), "utf8"),
        fixtureName,
      );
      const effectivePrompt = composeStylePrompt(
        chainedPrompt,
        style,
        BASE_CODING_INSTRUCTIONS,
      );
      const transport = createTransportCapture();
      const payload: TransportPayload = {
        messages: [
          { role: "system", content: effectivePrompt },
          { role: "user", content: "Summarize the change" },
        ],
      };

      transport.observe(payload);

      const capturedPayload = transport.read();
      const capturedSystemPrompt = capturedPayload.messages[0]?.content;
      if (capturedSystemPrompt === undefined) {
        throw new Error("The simulated transport did not receive a system prompt");
      }
      const capturedJson = JSON.stringify(capturedPayload);

      expect(capturedSystemPrompt).toContain("native instructions");
      expect(capturedSystemPrompt).toContain("project instructions");
      expect(capturedSystemPrompt.split(style.instructions).length - 1).toBe(1);
      const serializedInstructions = JSON.stringify(style.instructions).slice(1, -1);
      expect(capturedJson.split(serializedInstructions).length - 1).toBe(1);
      const serializedChainedPrompt = JSON.stringify(chainedPrompt).slice(1, -1);
      expect(capturedJson.split(serializedChainedPrompt).length - 1).toBe(1);
      if (style.keepCodingInstructions) {
        expect(capturedSystemPrompt).toContain(BASE_CODING_INSTRUCTIONS);
        expect(capturedJson.split(BASE_CODING_INSTRUCTIONS).length - 1).toBe(1);
      } else {
        expect(capturedSystemPrompt).not.toContain(BASE_CODING_INSTRUCTIONS);
        expect(capturedJson).not.toContain(BASE_CODING_INSTRUCTIONS);
      }
    }
  });
});
