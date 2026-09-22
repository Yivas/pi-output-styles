import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createEventBus,
  ExtensionRunner,
  discoverAndLoadExtensions,
  ModelRegistry,
  SessionManager,
  type ExtensionActions,
  type ExtensionContextActions,
  type ExtensionUIContext,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

type CapabilityStatus = "available" | "not-run" | "blocked";

type ReminderCapability = {
  capability: "turnReminder" | "waitingTurnReminder";
  status: CapabilityStatus;
  evidence: string;
};

const reminderCapabilities: ReadonlyArray<ReminderCapability> = [
  {
    capability: "turnReminder",
    status: "available",
    evidence: "turn_start callback was registered and dispatched by ExtensionRunner.emit",
  },
  {
    capability: "waitingTurnReminder",
    status: "blocked",
    evidence: "Pi 0.87.0 declares no public event whose contract means background work is the only remaining work",
  },
];

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createHookProbe() {
  const cwd = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "pi-output-styles-reminders-"));
  temporaryDirectories.push(cwd);
  const extensionPath = join(cwd, "reminders-hooks-extension.ts");
  await writeFile(
    extensionPath,
    `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("turn_start", (event, ctx) => {
    ctx.ui.notify("turn_start:" + event.turnIndex, "info");
  });
  pi.on("turn_end", (event, ctx) => {
    ctx.ui.notify("turn_end:" + event.turnIndex, "info");
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

  return { notifications, runner };
}

describe("Pi reminder hook probe", () => {
  it("observes turn start and turn end callbacks without a provider", async () => {
    const { notifications, runner } = await createHookProbe();

    await runner.emit({ type: "turn_start", turnIndex: 1, timestamp: 123 });
    await runner.emitBoundary(
      {
        type: "turn_end",
        turnIndex: 1,
        message: {},
        toolResults: [],
        messageEntryId: "message-1",
        toolResultEntryIds: [],
        outcome: "completed",
      } as unknown as Parameters<ExtensionRunner["emitBoundary"]>[0],
      async () => ({
        contextEntries: [],
        contextMessages: [],
        llmMessages: [],
        pendingMessages: [],
        canContinue: false,
      }),
    );

    expect(notifications).toEqual(["turn_start:1", "turn_end:1"]);
  });

  it("dispatches the style reminder through the public turn hook once", async () => {
    const cwd = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "pi-output-styles-reminder-adapter-"));
    temporaryDirectories.push(cwd);
    const extensionPath = join(cwd, "reminder-adapter-extension.ts");
    const remindersModule = pathToFileURL(join(process.cwd(), "src/reminders.ts")).href;
    await writeFile(
      extensionPath,
      `import { registerStyleReminders } from ${JSON.stringify(remindersModule)};
export default function (pi) {
  registerStyleReminders(pi, () => ({
    id: "concise",
    name: "Concise",
    description: "Keep responses focused.",
    keepCodingInstructions: true,
    instructions: "Keep the response focused.",
    source: "file",
    turnReminder: "Keep the active output style in mind.",
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

    await runner.emit({ type: "turn_start", turnIndex: 1, timestamp: 123 });
    const promptResult = await runner.emitBeforeAgentStart("prompt", undefined, { cwd, customPrompt: "native prompt" });

    expect(notifications).toEqual(["Keep the active output style in mind."]);
    expect(promptResult.systemPromptOptions.forceSystemPrompt ?? "").not.toContain("Keep the active output style in mind.");
  });

  it("observes the final settled notification hook without a provider", async () => {
    const { notifications, runner } = await createHookProbe();

    await runner.emit({ type: "agent_settled" });

    expect(notifications).toEqual(["agent_settled"]);
  });

  it("records fail-closed capability status for the waiting boundary", () => {
    expect(reminderCapabilities).toEqual([
      expect.objectContaining({ capability: "turnReminder", status: "available" }),
      expect.objectContaining({ capability: "waitingTurnReminder", status: "blocked" }),
    ]);
    expect(reminderCapabilities[1].evidence).toContain("no public event");
  });
});
