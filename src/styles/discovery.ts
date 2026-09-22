import { readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { normalizeStyleId } from "./parser.js";

export type CustomStyleSource = "user" | "project";

export interface DiscoveredStyleFile {
  path: string;
  source: CustomStyleSource;
}

export function discoverStyleFiles(
  projectRoot: string,
  homeDir: string,
): readonly DiscoveredStyleFile[] {
  const userStyles = listStyleFiles(join(homeDir, ".pi", "agent", "output-styles"), "user");
  const projectStyles = listStyleFiles(join(projectRoot, ".pi", "output-styles"), "project");
  return [...userStyles, ...projectStyles];
}

export function styleIdFromFilename(filePath: string): string {
  const filename = basename(filePath);
  const stem = extname(filename) === ".md" ? filename.slice(0, -extname(filename).length) : filename;
  return normalizeStyleId(stem);
}

function listStyleFiles(directory: string, source: CustomStyleSource): DiscoveredStyleFile[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === ".md")
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map((entry) => ({ path: join(directory, entry.name), source }));
}

function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
