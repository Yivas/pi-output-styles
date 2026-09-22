import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { StyleDefinition } from "./styles/types.js";

export interface ReminderCapability {
  turn: boolean;
  waiting: boolean;
}

export function registerStyleReminders(
  pi: ExtensionAPI,
  getActiveStyle: () => StyleDefinition,
): ReminderCapability {
  if (typeof pi.on !== "function") {
    return { turn: false, waiting: false };
  }

  try {
    pi.on("turn_start", (_event, context) => {
      const reminder = getActiveStyle().turnReminder;
      if (!hasReminder(reminder)) {
        return;
      }
      context.ui.notify(reminder, "info");
    });
  } catch {
    return { turn: false, waiting: false };
  }

  return { turn: true, waiting: false };
}

function hasReminder(reminder: string | undefined): reminder is string {
  return typeof reminder === "string" && reminder.trim().length > 0;
}

