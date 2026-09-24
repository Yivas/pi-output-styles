import { describe, expect, it, vi } from "vitest";
import { createBuiltinRegistry, resolveActiveStyle } from "../../src/styles/registry.js";
import { invalidBuiltinId } from "../fixtures/styles/builtin-invalid-id.test-data.js";

describe("builtin style registry", () => {
  it("lists the ten built-in styles in stable order", () => {
    const registry = createBuiltinRegistry();

    expect(registry.list().map((style) => style.id)).toEqual([
      "default",
      "proactive",
      "concise",
      "explanatory",
      "learning",
      "reviewer",
      "diagrams-first",
      "ste",
      "caveman",
      "eli5",
    ]);
    expect(registry.list().map((style) => style.name)).toEqual([
      "default",
      "Proactive",
      "Concise",
      "Explanatory",
      "Learning",
      "Reviewer",
      "Diagrams first",
      "STE",
      "Caveman",
      "ELI5",
    ]);
  });

  it("enables coding instructions only for the nine non-default built-ins", () => {
    const registry = createBuiltinRegistry();

    expect(registry.list().map(({ id, keepCodingInstructions }) => ({
      id,
      keepCodingInstructions,
    }))).toEqual([
      { id: "default", keepCodingInstructions: false },
      { id: "proactive", keepCodingInstructions: true },
      { id: "concise", keepCodingInstructions: true },
      { id: "explanatory", keepCodingInstructions: true },
      { id: "learning", keepCodingInstructions: true },
      { id: "reviewer", keepCodingInstructions: true },
      { id: "diagrams-first", keepCodingInstructions: true },
      { id: "ste", keepCodingInstructions: true },
      { id: "caveman", keepCodingInstructions: true },
      { id: "eli5", keepCodingInstructions: true },
    ]);
  });

  it("resolves each built-in and leaves default without instructions", () => {
    const registry = createBuiltinRegistry();

    expect(registry.resolve("default")).toMatchObject({ id: "default", instructions: "" });
    for (const styleId of ["proactive", "concise", "explanatory", "learning", "reviewer", "diagrams-first", "ste", "caveman", "eli5"]) {
      expect(registry.resolve(styleId)?.instructions.length).toBeGreaterThan(0);
    }
  });

  it("uses default when no style is selected", () => {
    const registry = createBuiltinRegistry();

    expect(resolveActiveStyle(registry, undefined).id).toBe("default");
  });

  it("falls back to default for an unknown selected style", () => {
    const registry = createBuiltinRegistry();
    const warning = vi.fn();

    expect(resolveActiveStyle(registry, invalidBuiltinId, warning).id).toBe("default");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({
      code: "unknown-style",
      styleId: invalidBuiltinId,
    }));
    expect(registry.resolve(invalidBuiltinId)).toBeUndefined();
  });
});
