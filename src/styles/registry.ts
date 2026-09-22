import { BUILTIN_STYLES } from "./builtin.js";
import type { StyleDefinition, StyleRegistry } from "./types.js";

export function createBuiltinRegistry(): StyleRegistry {
  return {
    list: () => BUILTIN_STYLES,
    resolve: (id) => BUILTIN_STYLES.find((style) => style.id === id),
  };
}

export function resolveActiveStyle(
  registry: StyleRegistry,
  selectedId: string | undefined,
): StyleDefinition {
  const id = selectedId ?? "default";
  const style = registry.resolve(id);
  if (!style) {
    throw new Error(`Unknown output style: ${id}`);
  }
  return style;
}
