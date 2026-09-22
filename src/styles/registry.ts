import { BUILTIN_STYLES } from "./builtin.js";
import type { StyleDefinition, StyleRegistry } from "./types.js";

export interface StyleResolutionWarning {
  code: "unknown-style" | "empty-style";
  message: string;
  styleId: string;
}

export type StyleResolutionWarningHandler = (warning: StyleResolutionWarning) => void;

export function createBuiltinRegistry(): StyleRegistry {
  return {
    list: () => BUILTIN_STYLES,
    resolve: (id) => BUILTIN_STYLES.find((style) => style.id === id),
  };
}

export function resolveActiveStyle(
  registry: StyleRegistry,
  selectedId: string | undefined,
  onWarning?: StyleResolutionWarningHandler,
): StyleDefinition {
  const fallback = registry.resolve("default");
  if (!fallback) {
    throw new Error("Output style registry does not define default");
  }

  if (selectedId === undefined) {
    return fallback;
  }

  const style = registry.resolve(selectedId);
  if (!style) {
    onWarning?.({
      code: "unknown-style",
      message: `Unknown output style selection ${selectedId}; using default`,
      styleId: selectedId,
    });
    return fallback;
  }
  if (style.source !== "builtin" && style.instructions.trim().length === 0) {
    onWarning?.({
      code: "empty-style",
      message: `Output style ${selectedId} has no instructions; using default`,
      styleId: selectedId,
    });
    return fallback;
  }

  return style;
}
