import type { StyleDefinition, StyleRegistry } from "./types.js";

export interface MergeWarning {
  code: "style-collision";
  message: string;
  styleId: string;
  losingSource: string;
  winningSource: string;
}

export interface MergedStyleSources {
  registry: StyleRegistry;
  warnings: readonly MergeWarning[];
}

export function mergeStyleSources(
  builtin: StyleRegistry,
  user: readonly StyleDefinition[],
  project: readonly StyleDefinition[],
): MergedStyleSources {
  const styles = new Map<string, StyleDefinition>();
  const warnings: MergeWarning[] = [];

  for (const style of [...builtin.list(), ...user, ...project]) {
    const previous = styles.get(style.id);
    if (previous) {
      warnings.push({
        code: "style-collision",
        message: `Style collision for ${style.id}: ${formatSource(previous.source)} is overridden by ${formatSource(style.source)}`,
        styleId: style.id,
        losingSource: previous.source,
        winningSource: style.source,
      });
    }
    styles.set(style.id, style);
  }

  const mergedStyles = [...styles.values()];
  return {
    registry: {
      list: () => mergedStyles,
      resolve: (id) => styles.get(id),
    },
    warnings,
  };
}

function formatSource(source: StyleDefinition["source"]): string {
  return source === "builtin" ? "built-in" : source;
}
