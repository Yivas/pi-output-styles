import type { StyleMenuTheme } from "./style-menu.js";

/** Status-bar key owned by this extension; keeps our entry distinct from other extensions. */
export const STATUS_INDICATOR_KEY = "pi-output-styles";

/** The ExtensionUIContext surface the indicator is allowed to touch: setStatus only, never setFooter. */
export interface StatusIndicatorHost {
  setStatus(key: string, text: string | undefined): void;
}

/**
 * Paints `style: <name>` for the effective style: muted for `default`, accent otherwise.
 * Colors come from the injected theme (docs/tui.md Pattern 4 passes `ctx.ui.theme.fg(...)`
 * to `setStatus`); `undefined` clears the entry.
 */
export function paintStyleStatus(
  host: StatusIndicatorHost,
  theme: StyleMenuTheme,
  style: { id: string; name: string } | undefined,
): void {
  if (style === undefined) {
    host.setStatus(STATUS_INDICATOR_KEY, undefined);
    return;
  }
  const color = style.id === "default" ? "muted" : "accent";
  host.setStatus(STATUS_INDICATOR_KEY, theme.fg(color, `style: ${style.name}`));
}
