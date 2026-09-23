import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerOutputStyleCommand, parseOutputStyleArgs } from "../src/commands.js";
import { registerSystemPromptHook } from "../src/prompt.js";
import { SelectionState } from "../src/state.js";
import { createBuiltinRegistry } from "../src/styles/registry.js";

describe("parseOutputStyleArgs", () => {
  it.each([
    ["", { action: "list" }],
    ["list", { action: "list" }],
    ["status", { action: "status" }],
    ["Concise", { action: "select", styleId: "concise" }],
  ])("parses %j", (args, expected) => {
    expect(parseOutputStyleArgs(args)).toEqual(expected);
  });

  it("keeps an unknown style as a selection for registry validation", () => {
    expect(parseOutputStyleArgs("missing-style")).toEqual({
      action: "select",
      styleId: "missing-style",
    });
  });
});

describe("/output-style", () => {
  function registerCommand() {
    const registry = createBuiltinRegistry();
    const state = new SelectionState();
    let command: RegisteredCommand | undefined;
    const extensionApi = {
      registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
        command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
      }),
    } as unknown as ExtensionAPI;

    registerOutputStyleCommand(extensionApi, registry, state);

    return { command: command as RegisteredCommand, state };
  }

  function context(hasUI: boolean, notify = vi.fn()): ExtensionCommandContext {
    if (!hasUI) {
      return { hasUI } as unknown as ExtensionCommandContext;
    }
    return { hasUI, ui: { notify } } as unknown as ExtensionCommandContext;
  }

  it("lists the built-ins and marks the active style without exposing prompt contents", async () => {
    const { command } = registerCommand();
    const notify = vi.fn();

    await command.handler("", context(true, notify));

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toContain("Active: default");
    expect(notify.mock.calls[0]?.[0]).toContain("Concise");
    const listing = notify.mock.calls[0]?.[0] as string;
    for (const style of createBuiltinRegistry().list()) {
      if (style.instructions) {
        expect(listing).not.toContain(style.instructions);
      }
    }
  });

  it("reports status and changes the active style for later turns", async () => {
    const { command, state } = registerCommand();
    const notify = vi.fn();
    const promptHandler = vi.fn();
    const promptApi = {
      on: (_event: string, handler: typeof promptHandler) => {
        promptHandler.mockImplementation(handler);
        return () => {};
      },
    } as unknown as ExtensionAPI;
    registerSystemPromptHook(promptApi, createBuiltinRegistry(), () => state.getSelected());

    await command.handler("status", context(true, notify));
    expect(notify).toHaveBeenLastCalledWith("Active output style: default", "info");

    await command.handler("Concise", context(true, notify));
    expect(state.getSelected()).toBe("concise");
    expect(notify).toHaveBeenLastCalledWith("Output style selected: Concise", "info");

    const result = await promptHandler(
      {
        type: "before_agent_start",
        prompt: "Continue",
        systemPrompt: "Native instructions",
        systemPromptOptions: {},
      } as BeforeAgentStartEvent,
      {} as never,
    );
    expect(result).toEqual({
      systemPrompt: expect.stringContaining("## Output style: Concise"),
    });
  });

  it("reports an unknown style and leaves the active style unchanged", async () => {
    const { command, state } = registerCommand();
    const notify = vi.fn();

    await command.handler("unknown", context(true, notify));

    expect(state.getSelected()).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith("Unknown output style: unknown", "error");
  });

  it("changes state without requiring UI", async () => {
    const { command, state } = registerCommand();

    await expect(command.handler("Concise", context(false))).resolves.toBeUndefined();
    expect(state.getSelected()).toBe("concise");
  });
});
