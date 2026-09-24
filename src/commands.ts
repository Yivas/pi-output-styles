import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { normalizeStyleId } from "./styles/parser.js";
import type { SelectionStore } from "./settings.js";
import type { StyleDefinition, StyleRegistry } from "./styles/types.js";
import { SelectionState } from "./state.js";
import { StyleMenu, type StyleMenuForce } from "./ui/style-menu.js";
import { paintStyleStatus } from "./ui/status-indicator.js";

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
  activeForce?: () => StyleMenuForce | undefined,
): void {
  // Single application path for both the direct `<id>` route and the menu's Enter.
  const applySelection = async (ctx: ExtensionCommandContext, styleId: string): Promise<void> => {
    const style = registry.resolve(styleId);
    if (!style) {
      notify(ctx, `Unknown output style: ${styleId}`, "error");
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
    if (ctx.mode === "tui") {
      paintStyleStatus(ctx.ui, ctx.ui.theme, style);
    }
    notify(ctx, `Output style selected: ${style.name}`);
  };

  pi.registerCommand("output-style", {
    description: "List or select the active output style",
    handler: async (args, ctx) => {
      const parsed = parseOutputStyleArgs(args);
      if (parsed.action === "list") {
        // The menu is the no-argument route and only exists in the TUI; every other
        // mode and the explicit `list` argument keep the plain-text listing.
        if (args.trim().length === 0 && ctx.mode === "tui") {
          // Native dialog slot: ctx.ui.custom without overlay mounts the component in
          // the editor container, the same place as Pi's own dialogs (ui.select and the
          // model picker), and restores the editor on close. Natural height is one row
          // per style plus one spare row for the detail zone and the menu chrome
          // (two borders and the footer), capped to fit the screen.
          const naturalHeight = registry.list().length + 4;
          const chosenId = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) =>
            new StyleMenu({
              registry,
              theme,
              activeStyleId: getActiveStyle(registry, state).id,
              getForce: activeForce,
              maxHeight: () => Math.min(naturalHeight, Math.max(4, tui.terminal.rows - 2)),
              done,
              requestRender: () => tui.requestRender(),
            }),
          );
          if (chosenId) {
            await applySelection(ctx, chosenId);
          }
          return;
        }
        notify(ctx, formatStyleList(registry, state));
        return;
      }
      if (parsed.action === "status") {
        notify(ctx, `Active output style: ${getActiveStyle(registry, state).name}`);
        return;
      }

      await applySelection(ctx, parsed.styleId);
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
