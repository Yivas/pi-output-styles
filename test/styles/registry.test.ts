import { describe, expect, it } from "vitest";
import { createBuiltinRegistry, resolveActiveStyle } from "../../src/styles/registry.js";
import { invalidBuiltinId } from "../fixtures/styles/builtin-invalid-id.test-data.js";

describe("builtin style registry", () => {
  it("lists the five built-in styles in stable order", () => {
    const registry = createBuiltinRegistry();

    expect(registry.list().map((style) => style.id)).toEqual([
      "default",
      "proactive",
      "concise",
      "explanatory",
      "learning",
    ]);
    expect(registry.list().map((style) => style.name)).toEqual([
      "default",
      "Proactive",
      "Concise",
      "Explanatory",
      "Learning",
    ]);
  });

  it("enables coding instructions for every built-in", () => {
    const registry = createBuiltinRegistry();

    expect(registry.list().map(({ id, keepCodingInstructions }) => ({
      id,
      keepCodingInstructions,
    }))).toEqual([
      { id: "default", keepCodingInstructions: true },
      { id: "proactive", keepCodingInstructions: true },
      { id: "concise", keepCodingInstructions: true },
      { id: "explanatory", keepCodingInstructions: true },
      { id: "learning", keepCodingInstructions: true },
    ]);
  });

  it("resolves each built-in and leaves default without instructions", () => {
    const registry = createBuiltinRegistry();

    expect(registry.resolve("default")).toMatchObject({ id: "default", instructions: "" });
    expect(registry.resolve("proactive")?.instructions).toContain("initiative");
    expect(registry.resolve("concise")?.instructions).toContain("compact");
    expect(registry.resolve("explanatory")?.instructions).toContain("decisions");
    expect(registry.resolve("learning")?.instructions).toContain("small");
  });

  it("uses default when no style is selected", () => {
    const registry = createBuiltinRegistry();

    expect(resolveActiveStyle(registry, undefined).id).toBe("default");
  });

  it("rejects an unknown selected style", () => {
    const registry = createBuiltinRegistry();

    expect(() => resolveActiveStyle(registry, invalidBuiltinId)).toThrow(/unknown|not found/i);
    expect(registry.resolve(invalidBuiltinId)).toBeUndefined();
  });
});
