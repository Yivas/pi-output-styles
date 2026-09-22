import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCustomStyles } from "../../src/styles/custom-loader.js";
import type { DiscoveredStyleFile } from "../../src/styles/discovery.js";

const fixturesDirectory = fileURLToPath(new URL("../fixtures/custom/user/", import.meta.url));

function fixturePath(name: string): string {
  return `${fixturesDirectory}${name}`;
}

function fixtureFiles(): readonly DiscoveredStyleFile[] {
  return ["Valid.md", "Malformed.md", "Empty.md"].map((name) => ({
    path: fixturePath(name),
    source: "user",
  }));
}

describe("loadCustomStyles", () => {
  it("loads valid files with filename identifiers and diagnostic origin", () => {
    const result = loadCustomStyles(fixtureFiles());

    expect(result.styles).toEqual([
      {
        id: "valid",
        name: "Display Name",
        description: "A valid custom style.",
        keepCodingInstructions: true,
        instructions: "Keep this body as literal style instructions.\n",
        source: "user",
        filePath: fixturePath("Valid.md"),
      },
    ]);

    const projectResult = loadCustomStyles([{ path: fixturePath("Valid.md"), source: "project" }]);
    expect(projectResult.styles[0]?.source).toBe("project");
  });

  it("isolates malformed and empty files and keeps warning bodies private", () => {
    const result = loadCustomStyles(fixtureFiles());

    expect(result.styles).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "invalid-style",
        path: fixturePath("Malformed.md"),
        styleId: "malformed",
      }),
      expect.objectContaining({
        code: "empty-style",
        path: fixturePath("Empty.md"),
        styleId: "empty",
      }),
    ]));
    expect(result.warnings.map(({ message }) => message).join("\n")).not.toContain(
      "DO NOT INCLUDE THIS BODY IN A WARNING.",
    );
  });

  it("does not alter file contents while loading", async () => {
    const path = fixturePath("Valid.md");
    const before = await readFile(path, "utf8");

    loadCustomStyles([{ path, source: "project" }]);

    await expect(readFile(path, "utf8")).resolves.toBe(before);
  });
});
