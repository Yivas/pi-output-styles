import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEventBus,
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  SessionManager,
  type BuildSystemPromptOptions,
  type ExtensionActions,
  type ExtensionContextActions,
  type ExtensionUIContext,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";

const originalAgentDirectory = process.env.PI_CODING_AGENT_DIR;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  if (originalAgentDirectory === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalAgentDirectory;
  }
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const ourExtensionPath = fileURLToPath(new URL("../../src/extension.ts", import.meta.url));

// Consumer contract: subscribe to the delivery channel first, then emit the
// request; the provider re-emits the live controller for any request.
const probeExtensionSource = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let releaseHandle: (() => void) | undefined;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("interop-probe-release", {
    description: "Release the delivered forced-style handle",
    handler: async (_args, ctx) => {
      if (!releaseHandle) {
        ctx.ui.notify("missing-controller", "error");
        return;
      }
      releaseHandle();
      releaseHandle = undefined;
      ctx.ui.notify("released", "info");
    },
  });
  pi.events.on("pi-response-styles:style-controller", (data) => {
    const controller = data as {
      force: (pluginId: string, styleId: string) => { release: () => void };
    };
    const handle = controller.force("interop-probe", "concise");
    releaseHandle = () => handle.release();
  });
  pi.events.emit("pi-response-styles:style-controller-request", undefined);
}
`;

async function loadWithProbe(providerFirst: boolean) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-output-styles-interop-"));
  temporaryDirectories.push(cwd);
  const probePath = join(cwd, "probe-extension.ts");
  await writeFile(probePath, probeExtensionSource);
  process.env.PI_CODING_AGENT_DIR = cwd;
  const paths = providerFirst ? [ourExtensionPath, probePath] : [probePath, ourExtensionPath];
  const loaded = await discoverAndLoadExtensions(paths, cwd, cwd, createEventBus());
  expect(loaded.errors).toEqual([]);
  const runner = new ExtensionRunner(
    loaded.extensions,
    loaded.runtime,
    cwd,
    SessionManager.inMemory(cwd),
    new ModelRegistry({} as unknown as ModelRuntime),
  );
  const notifications: string[] = [];
  runner.setUIContext(
    { notify: (message: string) => notifications.push(message) } as unknown as ExtensionUIContext,
    "print",
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
  const readPrompt = async (): Promise<string | undefined> => {
    const promptOptions: BuildSystemPromptOptions = { cwd, customPrompt: "Native instructions" };
    const result = await runner.emitBeforeAgentStart("probe", undefined, promptOptions);
    return result.systemPromptOptions.forceSystemPrompt;
  };
  return { runner, notifications, readPrompt };
}

describe("cross-plugin style controller interop", () => {
  // Each load order boots Pi's real loader and event bus twice: under load the 5s default
  // times out, so this test gets a wider budget (test-only, never shipped).
  it("delivers the controller to a consumer extension in either load order", { timeout: 20_000 }, async () => {
    for (const providerFirst of [true, false]) {
      const { readPrompt } = await loadWithProbe(providerFirst);
      const label = `providerFirst=${providerFirst}`;
      const prompt = await readPrompt();
      expect(prompt, label).toContain("Native instructions");
      expect(prompt, label).toContain("## Output style: Concise");
    }
  });

  it("returns to the selected style when the consumer releases the handle", async () => {
    const { runner, notifications, readPrompt } = await loadWithProbe(true);
    expect(await readPrompt()).toContain("## Output style: Concise");

    const command = runner.getCommand("interop-probe-release");
    expect(command).toBeDefined();
    await command?.handler("", runner.createCommandContext());

    expect(notifications).toEqual(["released"]);
    const restored = await readPrompt();
    expect(restored).toContain("Native instructions");
    expect(restored).not.toContain("## Output style: Concise");
  });
});
