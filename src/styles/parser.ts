import type { StyleDefinition } from "./types.js";

const REQUIRED_FIELDS = ["name", "description", "keep-coding-instructions"] as const;
type FrontmatterField = (typeof REQUIRED_FIELDS)[number];

type Frontmatter = Partial<Record<FrontmatterField, string | boolean>>;

export function normalizeStyleId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseStyleFile(text: string, source: string): StyleDefinition {
  const { frontmatter, instructions } = splitStyleFile(text, source);
  const values = parseFrontmatter(frontmatter, source);
  const name = requireString(values, "name", source);
  const description = requireString(values, "description", source);
  const keepCodingInstructions = values["keep-coding-instructions"];

  if (typeof keepCodingInstructions !== "boolean") {
    throw new Error(`${source}: keep-coding-instructions must be exactly true or false`);
  }

  const id = normalizeStyleId(name);
  if (id.length === 0) {
    throw new Error(`${source}: name must contain at least one identifier character`);
  }

  return {
    id,
    name,
    description,
    keepCodingInstructions,
    instructions,
    source: "file",
  };
}

function splitStyleFile(text: string, source: string): { frontmatter: string; instructions: string } {
  const firstLineEnd = text.indexOf("\n");
  if (firstLineEnd === -1 || text.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") {
    throw new Error(`${source}: style must start with YAML frontmatter`);
  }

  const frontmatterStart = firstLineEnd + 1;
  let lineStart = frontmatterStart;
  while (lineStart <= text.length) {
    const lineEnd = text.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(lineStart, end).replace(/\r$/, "");
    if (/^---[ \t]*$/.test(line)) {
      const bodyStart = lineEnd === -1 ? text.length : lineEnd + 1;
      return {
        frontmatter: text.slice(frontmatterStart, lineStart),
        instructions: text.slice(bodyStart),
      };
    }
    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }

  throw new Error(`${source}: frontmatter is not closed`);
}

function parseFrontmatter(text: string, source: string): Frontmatter {
  const values: Frontmatter = {};
  const seen = new Set<string>();

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9-]*):(?:[ \t]*(.*))?$/.exec(line);
    if (!match) {
      throw new Error(`${source}: invalid YAML on frontmatter line ${index + 1}`);
    }

    const [, key, rawValue = ""] = match;
    if (seen.has(key)) {
      throw new Error(`${source}: duplicate frontmatter field ${key}`);
    }
    seen.add(key);
    const parsedValue = parseScalar(rawValue, source, key);
    if (REQUIRED_FIELDS.includes(key as FrontmatterField)) {
      values[key as FrontmatterField] = parsedValue;
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in values)) {
      throw new Error(`${source}: missing required frontmatter field ${field}`);
    }
  }

  return values;
}

function parseScalar(value: string, source: string, key: string): string | boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "" && key === "keep-coding-instructions") {
    throw new Error(`${source}: keep-coding-instructions must be exactly true or false`);
  }
  if (value.startsWith("\"") || value.startsWith("'")) {
    const quote = value[0];
    if (value.length < 2 || value[value.length - 1] !== quote) {
      throw new Error(`${source}: invalid quoted value for ${key}`);
    }
    if (quote === '"') {
      try {
        return JSON.parse(value) as string;
      } catch {
        throw new Error(`${source}: invalid quoted value for ${key}`);
      }
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith("[") || value.startsWith("{")) {
    throw new Error(`${source}: unsupported YAML value for ${key}`);
  }
  return value;
}

function requireString(values: Frontmatter, field: "name" | "description", source: string): string {
  const value = values[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${source}: ${field} must be a non-empty string`);
  }
  return value;
}
