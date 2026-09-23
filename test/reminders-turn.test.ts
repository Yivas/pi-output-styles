import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { composeStylePrompt } from "../src/prompt.js";
import { registerStyleReminders } from "../src/reminders.js";
import { BASE_CODING_INSTRUCTIONS } from "../src/styles/coding-instructions.js";
import { createBuiltinRegistry } from "../src/styles/registry.js";
import type { StyleDefinition } from "../src/styles/types.js";

const styleWithReminder: StyleDefinition = {
  id: "concise",
  name: "Concise",
  description: "Keep responses focused.",
  keepCodingInstructions: true,
  instructions: "Keep the response focused.",
  source: "builtin",
  turnReminder: "Keep the active output style in mind.",
};

const styleWithoutReminder: StyleDefinition = {
  ...styleWithReminder,
  turnReminder: undefined,
};

type TurnStartHandler = (event: { type: "turn_start"; turnIndex: number; timestamp: number }, context: {
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}) => void | Promise<void>;

function createApi(onRegister: (event: string, handler: TurnStartHandler) => void): ExtensionAPI {
  return { on: onRegister } as unknown as ExtensionAPI;
}

describe("registerStyleReminders", () => {
  it("emits the active style reminder once for each eligible turn event", async () => {
    let turnStartHandler: TurnStartHandler | undefined;
    let activeStyle = styleWithReminder;
    const notifications: string[] = [];
    const api = createApi((event, handler) => {
      expect(event).toBe("turn_start");
      turnStartHandler = handler;
    });

    const capabilities = registerStyleReminders(api, () => activeStyle);
    expect(capabilities).toEqual({ turn: true, waiting: false });
    expect(turnStartHandler).toBeDefined();

    await turnStartHandler?.(
      { type: "turn_start", turnIndex: 1, timestamp: 100 },
      { ui: { notify: (message) => notifications.push(message) } },
    );
    activeStyle = { ...styleWithReminder, turnReminder: "Use the updated active style." };
    await turnStartHandler?.(
      { type: "turn_start", turnIndex: 2, timestamp: 200 },
      { ui: { notify: (message) => notifications.push(message) } },
    );

    expect(notifications).toEqual([
      "Keep the active output style in mind.",
      "Use the updated active style.",
    ]);
  });

  it("registers the turn capability without emitting when the active style has no reminder", () => {
    const notifications: string[] = [];
    const api = createApi(() => {});

    const capabilities = registerStyleReminders(api, () => styleWithoutReminder);

    expect(capabilities).toEqual({ turn: true, waiting: false });
    expect(notifications).toEqual([]);
  });

  it("treats an empty reminder as absent", () => {
    const api = createApi(() => {});
    const emptyReminderStyle = { ...styleWithReminder, turnReminder: "   " };

    expect(registerStyleReminders(api, () => emptyReminderStyle)).toEqual({
      turn: true,
      waiting: false,
    });
  });

  it("fails closed when the turn hook is unavailable", () => {
    const api = createApi(() => {
      throw new Error("turn_start is unavailable");
    });

    expect(registerStyleReminders(api, () => styleWithReminder)).toEqual({
      turn: false,
      waiting: false,
    });
  });
});

describe("declared built-in reminders", () => {
  const registry = createBuiltinRegistry();

  async function emitTurn(style: StyleDefinition): Promise<{
    capabilities: ReturnType<typeof registerStyleReminders>;
    notifications: string[];
    registeredEvents: string[];
  }> {
    let turnStartHandler: TurnStartHandler | undefined;
    const notifications: string[] = [];
    const registeredEvents: string[] = [];
    const api = createApi((event, handler) => {
      registeredEvents.push(event);
      turnStartHandler = handler;
    });

    const capabilities = registerStyleReminders(api, () => style);
    await turnStartHandler?.(
      { type: "turn_start", turnIndex: 1, timestamp: 100 },
      { ui: { notify: (message) => notifications.push(message) } },
    );
    return { capabilities, notifications, registeredEvents };
  }

  it("emits the declared Proactive and Concise turn reminders once per event and keeps them out of the prompt", async () => {
    for (const styleId of ["proactive", "concise"] as const) {
      const style = registry.resolve(styleId);
      if (!style?.turnReminder) {
        throw new Error(`The ${styleId} built-in must declare a turn reminder`);
      }

      const { capabilities, notifications, registeredEvents } = await emitTurn(style);

      expect(capabilities).toEqual({ turn: true, waiting: false });
      expect(registeredEvents).toEqual(["turn_start"]);
      expect(notifications).toEqual([style.turnReminder]);

      const composed = composeStylePrompt("Native instructions", style, BASE_CODING_INSTRUCTIONS);
      expect(composed).not.toContain(style.turnReminder);
    }
  });

  it("keeps the Proactive waiting reminder declared without ever emitting it", async () => {
    const style = registry.resolve("proactive");
    if (!style?.waitingTurnReminder) {
      throw new Error("The proactive built-in must declare a waiting reminder");
    }

    const { capabilities, notifications } = await emitTurn(style);

    expect(capabilities).toEqual({ turn: true, waiting: false });
    expect(notifications).toEqual([style.turnReminder]);
    expect(notifications.join("\n")).not.toContain(style.waitingTurnReminder);
  });

  it("stays silent for the built-ins that declare no reminders", async () => {
    for (const styleId of ["default", "explanatory", "learning"] as const) {
      const style = registry.resolve(styleId);
      if (!style) {
        throw new Error(`The ${styleId} built-in is missing`);
      }
      expect(style.turnReminder).toBeUndefined();
      expect(style.waitingTurnReminder).toBeUndefined();

      const { notifications } = await emitTurn(style);
      expect(notifications).toEqual([]);
    }
  });
});
