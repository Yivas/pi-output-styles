import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { normalizeStyleId } from "./styles/parser.js";
import type { SelectionStore } from "./settings.js";
import type { StyleDefinition, StyleRegistry } from "./styles/types.js";
import { SelectionState } from "./state.js";

export type OutputStyleArgs =
  | { action: "list" }
  | { action: "status" }
  | { action: "select"; styleId: string };

export function parseOutputStyleArgs(args: string): OutputStyleArgs {
  const value = args.trim();
  if (value.length === 0 || value.toLowerCase() === "list") {
    return { action: "list" };
  }
  if (value.toLowerCase() === "status") {
    return { action: "status" };
  }
  return { action: "select", styleId: normalizeStyleId(value) };
}

export function registerOutputStyleCommand(
  pi: ExtensionAPI,
  registry: StyleRegistry,
  state: SelectionState,
  selection?: SelectionStore,
): void {
  pi.registerCommand("output-style", {
    description: "List or select the active output style",
    handler: async (args, ctx) => {
      const parsed = parseOutputStyleArgs(args);
      if (parsed.action === "list") {
        notify(ctx, formatStyleList(registry, state));
        return;
      }
      if (parsed.action === "status") {
        notify(ctx, `Active output style: ${getActiveStyle(registry, state).name}`);
        return;
      }

      const style = registry.resolve(parsed.styleId);
      if (!style) {
        notify(ctx, `Unknown output style: ${parsed.styleId}`, "error");
        return;
      }

      if (selection) {
        try {
          await selection.write(style.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          notify(ctx, `Could not persist output style: ${message}`, "error");
          return;
        }
      }

      state.setSelected(style.id);
      notify(ctx, `Output style selected: ${style.name}`);
    },
  });
}

function formatStyleList(registry: StyleRegistry, state: SelectionState): string {
  const active = getActiveStyle(registry, state);
  const styles = registry.list()
    .map((style) => `${style.id === active.id ? "*" : " "} ${style.name} — ${style.description} [${formatStyleSource(style.source)}]`)
    .join("\n");
  return `Available output styles:\n${styles}\nActive: ${active.id}`;
}

function formatStyleSource(source: StyleDefinition["source"]): string {
  return source === "builtin" ? "built-in" : source;
}

function getActiveStyle(registry: StyleRegistry, state: SelectionState): StyleDefinition {
  const selectedId = state.getSelected();
  if (selectedId !== undefined) {
    const selected = registry.resolve(selectedId);
    if (selected) {
      return selected;
    }
  }

  const defaultStyle = registry.resolve("default");
  if (!defaultStyle) {
    throw new Error("Output style registry does not define default");
  }
  return defaultStyle;
}

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
  }
}
