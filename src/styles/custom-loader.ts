import { readFileSync } from "node:fs";
import { parseStyleFile } from "./parser.js";
import { styleIdFromFilename, type DiscoveredStyleFile } from "./discovery.js";
import type { StyleDefinition } from "./types.js";

export interface LoadWarning {
  code: "invalid-style" | "empty-style";
  message: string;
  path: string;
  styleId: string;
}

export interface CustomStyleLoadResult {
  styles: readonly StyleDefinition[];
  warnings: readonly LoadWarning[];
}

export function loadCustomStyles(files: readonly DiscoveredStyleFile[]): CustomStyleLoadResult {
  const styles: StyleDefinition[] = [];
  const warnings: LoadWarning[] = [];

  for (const file of files) {
    const styleId = styleIdFromFilename(file.path);
    try {
      const text = readFileSync(file.path, { encoding: "utf8" });
      const parsedStyle = parseStyleFile(text, file.path);
      const instructions = parsedStyle.instructions;
      const style: StyleDefinition = {
        ...parsedStyle,
        id: styleId,
        instructions,
        source: file.source,
        filePath: file.path,
      };

      if (style.id.length === 0) {
        throw new Error("filename must contain at least one identifier character");
      }
      if (style.instructions.trim().length === 0) {
        warnings.push({
          code: "empty-style",
          message: `Custom style has no instructions: ${file.path}`,
          path: file.path,
          styleId,
        });
        continue;
      }

      styles.push(style);
    } catch (error) {
      warnings.push({
        code: "invalid-style",
        message: `Could not load custom style ${file.path}: ${errorMessage(error)}`,
        path: file.path,
        styleId,
      });
    }
  }

  return { styles, warnings };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
