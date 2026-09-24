import { describe, expect, it } from "vitest";
import { stripControlSequences } from "../../src/text-safety.js";
import { StyleMenu, type StyleMenuTheme } from "../../src/ui/style-menu.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";
import { mergeStyleSources } from "../../src/styles/merge.js";
import type { StyleDefinition } from "../../src/styles/types.js";

const esc = String.fromCharCode(27);
const bel = String.fromCharCode(7);

const theme: StyleMenuTheme = { fg: (_color, text) => text };

function styleWith(overrides: Partial<StyleDefinition>): StyleDefinition {
  return {
    id: "hostile",
    name: "Hostile",
    description: "A custom style.",
    keepCodingInstructions: true,
    instructions: "A custom instruction body.",
    source: "project",
    filePath: ".pi/output-styles/hostile.md",
    ...overrides,
  };
}

function menuFor(style: StyleDefinition): StyleMenu {
  const registry = mergeStyleSources(createBuiltinRegistry(), [], [style]).registry;
  return new StyleMenu({
    registry,
    theme,
    activeStyleId: style.id,
    maxHeight: () => 24,
    done: () => undefined,
    requestRender: () => undefined,
  });
}

describe("stripControlSequences", () => {
  it("removes terminal sequences and keeps the printable text", () => {
    expect(stripControlSequences(`Hostile${esc}[2JName`)).toBe("HostileName");
    expect(stripControlSequences(`${esc}]8;;https://example.test${bel}link${esc}]8;;${bel}`)).toBe("link");
    expect(stripControlSequences(`${esc}]52;c;cGF3bmVk${bel}payload`)).toBe("payload");
    expect(stripControlSequences(`color${esc}[31mtext${esc}[0m`)).toBe("colortext");
    expect(stripControlSequences("tab\tand\nnewline")).toBe("tab\tand\nnewline");
  });

  it("removes the whole sequence, not only the escape byte, across families", () => {
    expect(stripControlSequences(`A${esc}(BB`)).toBe("AB");
    expect(stripControlSequences(`A${esc}7B`)).toBe("AB");
    expect(stripControlSequences(`A${esc}#8B`)).toBe("AB");
    expect(stripControlSequences(`A${String.fromCharCode(0x9b)}2JB`)).toBe("AB");
    expect(stripControlSequences(`A${esc}P1;2|payload${esc}\\B`)).toBe("AB");
    expect(stripControlSequences(`A${esc}]52;c;unterminatedB`)).toBe("A");
  });

  it("removes invisible formatting that reorders or hides text, keeping ZWJ", () => {
    expect(stripControlSequences("A\u202eB")).toBe("AB");
    expect(stripControlSequences("A\u2066B\u2069")).toBe("AB");
    expect(stripControlSequences("A\u200bB")).toBe("AB");
    expect(stripControlSequences("👩\u200d🎨")).toBe("👩\u200d🎨");
  });
});

describe("StyleMenu content safety", () => {
  it("keeps terminal control sequences from a custom style out of the render", () => {
    const output = menuFor(
      styleWith({
        name: `Hostile${esc}[2JName`,
        description: `Clear screen${esc}]8;;https://example.test${bel}link${esc}]8;;${bel}`,
        instructions: `Body${esc}]52;c;cGF3bmVk${bel} with escapes${esc}[31m.`,
        filePath: `.pi/output-styles/hostile${esc}[31m.md`,
      }),
    )
      .render(120)
      .join("\n");

    // The sequences a style file could otherwise send to the terminal are gone. (pi-tui adds
    // its own resets and link markers, so the check targets the hostile payloads specifically.)
    expect(output).not.toContain(`${esc}[2J`);
    expect(output).not.toContain("example.test");
    expect(output).not.toContain("cGF3bmVk");
    expect(output).not.toContain(`${esc}[31m`);
    // The printable text around the sequences survives.
    expect(output).toContain("Hostile");
    expect(output).toContain("Name");
    expect(output).toContain("Clear screen");
    expect(output).toContain("Body");
  });

  it("does not mutate the registry entries it paints", () => {
    const hostile = styleWith({ name: `Hostile${esc}[2JName` });
    const registry = mergeStyleSources(createBuiltinRegistry(), [], [hostile]).registry;
    new StyleMenu({
      registry,
      theme,
      activeStyleId: "hostile",
      maxHeight: () => 24,
      done: () => undefined,
      requestRender: () => undefined,
    }).render(120);

    expect(registry.resolve("hostile")?.name).toBe(`Hostile${esc}[2JName`);
  });

  it("keeps accents, emoji and wide characters intact", () => {
    const output = menuFor(
      styleWith({
        name: "Añejo 🎨 日本語",
        description: "Descripción con acentos.",
        instructions: "Cuerpo con emoji 🎨 y 日本語.",
      }),
    )
      .render(120)
      .join("\n");

    expect(output).toContain("Añejo 🎨 日本語");
    expect(output).toContain("Descripción con acentos.");
    expect(output).toContain("日本語");
  });
});
