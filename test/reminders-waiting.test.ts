import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerStyleReminders } from "../src/reminders.js";
import type { StyleDefinition } from "../src/styles/types.js";

const styleWithWaitingReminder: StyleDefinition = {
  id: "waiting",
  name: "Waiting",
  description: "A waiting reminder probe.",
  keepCodingInstructions: true,
  instructions: "Wait for background work when appropriate.",
  source: "file",
  waitingTurnReminder: "Background work is complete; wait for the next instruction.",
};

describe("waiting style reminders", () => {
  it("fails closed because Pi exposes no waiting-only public event", () => {
    const registeredEvents: string[] = [];
    const api = {
      on(event: string) {
        registeredEvents.push(event);
        if (event !== "turn_start") {
          throw new Error(`Unsupported event: ${event}`);
        }
        return () => {};
      },
    } as unknown as ExtensionAPI;

    const capabilities = registerStyleReminders(api, () => styleWithWaitingReminder);

    expect(capabilities).toEqual({ turn: true, waiting: false });
    expect(registeredEvents).toEqual(["turn_start"]);
  });

  it.skip("emits only after a public event confirms that executable work is finished", () => {
    expect.fail("Pi 0.87.0 does not expose a waiting-only event");
  });
});
