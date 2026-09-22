import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOutputStyleCommand } from "./commands.js";
import { registerSystemPromptHook } from "./prompt.js";
import { createSelectionStore } from "./settings.js";
import { SelectionState } from "./state.js";
import { createBuiltinRegistry } from "./styles/registry.js";

export default async function registerOutputStylesExtension(pi: ExtensionAPI): Promise<void> {
  const registry = createBuiltinRegistry();
  const startupErrors: Error[] = [];
  const selection = createSelectionStore(getAgentDir(), {
    validStyleIds: registry.list().map((style) => style.id),
    onError: (error) => {
      startupErrors.push(error);
      console.error(`[pi-output-styles] ${error.message}`);
    },
  });
  const state = new SelectionState(await selection.read());

  pi.on("session_start", (_event, ctx) => {
    for (const error of startupErrors.splice(0)) {
      if (ctx.hasUI) {
        ctx.ui.notify(error.message, "error");
      }
    }
  });
  registerSystemPromptHook(pi, registry, () => state.getSelected());
  registerOutputStyleCommand(pi, registry, state, selection);
}
