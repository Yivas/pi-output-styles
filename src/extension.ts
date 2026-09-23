import { dirname } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOutputStyleCommand } from "./commands.js";
import { registerSystemPromptHook } from "./prompt.js";
import { registerStyleReminders } from "./reminders.js";
import { createSelectionStore } from "./settings.js";
import { registerStyleControllerInterop } from "./interop.js";
import { SelectionState } from "./state.js";
import { discoverStyleFiles } from "./styles/discovery.js";
import { loadCustomStyles } from "./styles/custom-loader.js";
import { mergeStyleSources } from "./styles/merge.js";
import { createBuiltinRegistry, resolveActiveStyle } from "./styles/registry.js";
import { createForcedStyleController } from "./styles/forced.js";

export { ForcedStyleController, createForcedStyleController } from "./styles/forced.js";
export type { ForcedStyleHandle, ForcedStyleWarning, ForcedStyleWarningHandler } from "./styles/forced.js";

export default async function registerOutputStylesExtension(pi: ExtensionAPI): Promise<void> {
  const agentDirectory = getAgentDir();
  const startupErrors: Error[] = [];
  const builtinRegistry = createBuiltinRegistry();
  const customStyles = loadStyles(process.cwd(), dirname(dirname(agentDirectory)), startupErrors);
  const mergedStyles = mergeStyleSources(
    builtinRegistry,
    customStyles.filter((style) => style.source === "user"),
    customStyles.filter((style) => style.source === "project"),
  );
  for (const warning of mergedStyles.warnings) {
    startupErrors.push(new Error(warning.message));
  }

  let readingStartupSelection = true;
  const selection = createSelectionStore(agentDirectory, {
    validStyleIds: mergedStyles.registry.list().map((style) => style.id),
    onError: (error) => {
      if (readingStartupSelection) {
        startupErrors.push(error);
      }
      console.error(`[pi-output-styles] ${error.message}`);
    },
  });
  const initialSelection = await selection.read();
  readingStartupSelection = false;
  const state = new SelectionState(initialSelection);
  const forcedStyles = createForcedStyleController(mergedStyles.registry, (warning) => {
    startupErrors.push(new Error(warning.message));
    console.error(`[pi-output-styles] ${warning.message}`);
  });
  const reportResolutionWarning = (warning: { message: string }): void => {
    state.setSelected("default");
    startupErrors.push(new Error(warning.message));
  };
  const getSelectedStyleId = () => forcedStyles.resolve(state.getSelected());

  pi.on("session_start", (_event, ctx) => {
    for (const error of startupErrors.splice(0)) {
      if (ctx.hasUI) {
        ctx.ui.notify(error.message, "error");
      }
    }
  });
  const getActiveStyle = () => resolveActiveStyle(mergedStyles.registry, getSelectedStyleId(), reportResolutionWarning);
  registerSystemPromptHook(pi, mergedStyles.registry, getSelectedStyleId, reportResolutionWarning);
  registerStyleReminders(pi, getActiveStyle);
  registerOutputStyleCommand(pi, mergedStyles.registry, state, selection);
  registerStyleControllerInterop(pi, forcedStyles);
}

function loadStyles(projectRoot: string, homeDir: string, startupErrors: Error[]) {
  try {
    const files = discoverStyleFiles(projectRoot, homeDir);
    const loaded = loadCustomStyles(files);
    for (const warning of loaded.warnings) {
      startupErrors.push(new Error(warning.message));
    }
    return loaded.styles;
  } catch (error) {
    startupErrors.push(new Error(`Could not discover custom output styles: ${errorMessage(error)}`));
    return [];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
