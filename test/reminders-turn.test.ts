import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerStyleReminders } from "../src/reminders.js";
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
