import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeStyleId, parseStyleFile } from "../../src/styles/parser.js";
import type { StyleDefinition } from "../../src/styles/types.js";

const fixturesDirectory = fileURLToPath(new URL("../fixtures/styles/", import.meta.url));

async function readFixture(name: string): Promise<string> {
  return readFile(`${fixturesDirectory}${name}`, "utf8");
}

describe("parseStyleFile", () => {
  it("parses required frontmatter and preserves the body literally", async () => {
    const text = await readFixture("valid.md");

    const style: StyleDefinition = parseStyleFile(text, "valid.md");

    expect(style).toEqual({
      id: "focused-review",
      name: "Focused Review",
      description: "Keeps implementation reviews focused and actionable.",
      keepCodingInstructions: true,
      instructions: "Return the findings first.\n\nPreserve this spacing and punctuation: *literal*.\n",
      source: "file",
    });
  });

  it("parses a default style with an empty body", async () => {
    const style = parseStyleFile(await readFixture("default.md"), "default.md");

    expect(style.id).toBe("default");
    expect(style.instructions).toBe("");
    expect(style.keepCodingInstructions).toBe(false);
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseStyleFile("Instructions only", "missing-frontmatter.md")).toThrow(
      /frontmatter/i,
    );
  });

  it("rejects invalid YAML", () => {
    expect(() => parseStyleFile("---\nname: Broken\nnot yaml\n---\nBody", "invalid.md")).toThrow(
      /YAML|frontmatter/i,
    );
  });

  it("rejects missing required fields", () => {
    expect(() => parseStyleFile("---\nname: Missing description\n---\nBody", "missing-field.md")).toThrow(
      /description/i,
    );
  });

  it("requires a strict boolean for keep-coding-instructions", () => {
    expect(() => parseStyleFile(
      "---\nname: Loose\ndescription: Test\nkeep-coding-instructions: yes\n---\nBody",
      "invalid-boolean.md",
    )).toThrow(/keep-coding-instructions/i);
  });

  it("normalizes identifiers explicitly without changing the displayed name", () => {
    expect(normalizeStyleId("  Focused Review ")).toBe("focused-review");
    expect(normalizeStyleId("A/B: Test")).toBe("a-b-test");
  });
});
