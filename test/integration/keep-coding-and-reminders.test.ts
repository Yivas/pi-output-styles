import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi, afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { BASE_CODING_INSTRUCTIONS } from "../../src/styles/coding-instructions.js";
import type { StyleDefinition, StyleRegistry } from "../../src/styles/types.js";

const mockedAgentDirectory = vi.hoisted(() => ({ path: "" }));
const testStyles: readonly StyleDefinition[] = [
  {
    id: "default",
    name: "default",
    description: "Normal response behavior.",
    keepCodingInstructions: true,
    instructions: "",
    source: "builtin",
  },
  {
    id: "reminders",
    name: "Reminders",
    description: "Keeps each turn aligned with the selected style.",
    keepCodingInstructions: false,
    instructions: "Keep the response aligned with the selected style.",
    source: "file",
    turnReminder: "Review the selected style before answering.",
  },
];

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, getAgentDir: () => mockedAgentDirectory.path };
});

vi.mock("../../src/styles/registry.js", () => ({
  createBuiltinRegistry: (): StyleRegistry => ({
    list: () => testStyles,
    resolve: (id) => testStyles.find((style) => style.id === id),
  }),
  resolveActiveStyle: (registry: StyleRegistry, selectedId: string | undefined) =>
    registry.resolve(selectedId ?? "default") ?? registry.resolve("default"),
}));

import extension from "../../src/extension.js";

type RegisteredHandler = (event: unknown, context: unknown) => unknown;

type ExtensionHarness = {
  api: ExtensionAPI;
  handlers: Map<string, RegisteredHandler[]>;
  commands: Map<string, { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }>;
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  mockedAgentDirectory.path = "";
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function createExtensionApi(): ExtensionHarness {
  const handlers = new Map<string, RegisteredHandler[]>();
  const commands = new Map<string, { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }>();
  const api = {
    on(event: string, handler: RegisteredHandler) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
      return () => {
        handlers.set(event, eventHandlers.filter((registeredHandler) => registeredHandler !== handler));
      };
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

async function emitPrompt(harness: ExtensionHarness, systemPrompt: string): Promise<string> {
  const handlers = harness.handlers.get("before_agent_start") ?? [];
  const result = await handlers[0]?.({ systemPrompt }, {});
  return (result as { systemPrompt?: string } | undefined)?.systemPrompt ?? systemPrompt;
}

async function emitTurn(harness: ExtensionHarness, notify: (message: string) => void, turnIndex: number): Promise<void> {
  const handlers = harness.handlers.get("turn_start") ?? [];
  await handlers[0]?.(
    { type: "turn_start", turnIndex, timestamp: turnIndex },
    { ui: { notify } },
  );
}

describe("integrated coding instructions and reminders", () => {
  it("keeps one active-style owner across startup, switching, turns, and context rebuilds", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "pi-output-styles-integration-"));
    temporaryDirectories.push(agentDirectory);
    mockedAgentDirectory.path = agentDirectory;

    const first = createExtensionApi();
    await extension(first.api);

    expect(first.handlers.get("before_agent_start")).toHaveLength(1);
    expect(first.handlers.get("turn_start")).toHaveLength(1);

    const nativePrompt = "Native instructions";
    const initialPrompt = await emitPrompt(first, nativePrompt);
    expect(initialPrompt).toContain(BASE_CODING_INSTRUCTIONS);
    expect(initialPrompt).not.toContain("Review the selected style before answering.");

    const notifications: string[] = [];
    await emitTurn(first, (message) => notifications.push(message), 1);
    expect(notifications).toEqual([]);

    const command = first.commands.get("output-style");
    await command?.handler("Reminders", commandContext());

    const changedPrompt = await emitPrompt(first, nativePrompt);
    expect(changedPrompt).not.toContain(BASE_CODING_INSTRUCTIONS);
    expect(changedPrompt.split("Keep the response aligned with the selected style.").length - 1).toBe(1);

    await emitTurn(first, (message) => notifications.push(message), 2);
    expect(notifications).toEqual(["Review the selected style before answering."]);

    const rebuiltPrompt = await emitPrompt(first, nativePrompt);
    expect(rebuiltPrompt).toBe(changedPrompt);
    expect(rebuiltPrompt.split("Keep the response aligned with the selected style.").length - 1).toBe(1);

    const restarted = createExtensionApi();
    await extension(restarted.api);
    expect(await emitPrompt(restarted, nativePrompt)).toBe(changedPrompt);
    await emitTurn(restarted, (message) => notifications.push(message), 3);
    expect(notifications).toEqual([
      "Review the selected style before answering.",
      "Review the selected style before answering.",
    ]);
  });
});
