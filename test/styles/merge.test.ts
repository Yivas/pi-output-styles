import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCustomStyles } from "../../src/styles/custom-loader.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";
import { mergeStyleSources } from "../../src/styles/merge.js";

const projectCollisionPath = fileURLToPath(new URL("../fixtures/custom/project/Concise.md", import.meta.url));

function loadFixture(path: string, source: "user" | "project") {
  return loadCustomStyles([{ path, source }]).styles;
}

describe("mergeStyleSources", () => {
  it("uses project over user over built-in without duplicate identifiers", () => {
    const userStyles = [
      ...loadFixture(fileURLToPath(new URL("../fixtures/custom/user/Concise.md", import.meta.url)), "user"),
      {
        id: "user-only",
        name: "User Only",
        description: "User-only style.",
        keepCodingInstructions: true,
        instructions: "User-only instructions.",
        source: "user" as const,
      },
    ];
    const projectStyles = [
      ...loadFixture(projectCollisionPath, "project"),
      {
        id: "project-only",
        name: "Project Only",
        description: "Project-only style.",
        keepCodingInstructions: true,
        instructions: "Project-only instructions.",
        source: "project" as const,
      },
    ];

    const result = mergeStyleSources(createBuiltinRegistry(), userStyles, projectStyles);

    expect(result.registry.list().map((style) => style.id)).toEqual([
      "default",
      "proactive",
      "concise",
      "explanatory",
      "learning",
      "user-only",
      "project-only",
    ]);
    expect(result.registry.resolve("concise")).toMatchObject({
      source: "project",
      name: "Project Concise",
    });
    expect(new Set(result.registry.list().map((style) => style.id)).size).toBe(result.registry.list().length);
  });

  it("warns with the losing and winning sources for each collision", () => {
    const userStyles = loadFixture(
      fileURLToPath(new URL("../fixtures/custom/user/Concise.md", import.meta.url)),
      "user",
    );
    const projectStyles = loadFixture(projectCollisionPath, "project");

    const result = mergeStyleSources(createBuiltinRegistry(), userStyles, projectStyles);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      expect.stringMatching(/concise.*built-in.*user/i),
      expect.stringMatching(/concise.*user.*project/i),
    ]);
  });
});
