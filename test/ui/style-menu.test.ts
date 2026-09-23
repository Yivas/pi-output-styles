import { describe, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { StyleMenu, type StyleMenuForce, type StyleMenuTheme } from "../../src/ui/style-menu.js";
import type { StyleDefinition, StyleRegistry } from "../../src/styles/types.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";
import { ForcedStyleController } from "../../src/styles/forced.js";
import { mergeStyleSources } from "../../src/styles/merge.js";

function fakeTheme(): StyleMenuTheme {
  return {
    fg: (color, text) => `[${color}]${text}[/]`,
  };
}

// The fake theme wraps text in printable tags so tests can assert colors; real theme
// colors are zero-width ANSI, so the tags are removed before measuring render width.
function renderedWidth(line: string): number {
  return visibleWidth(line.replace(/\[(?:accent|border|dim|muted|text|warning)\]|\[\/\]/g, ""));
}

function customStyle(overrides: Partial<StyleDefinition>): StyleDefinition {
  return {
    id: "custom-style",
    name: "Custom Style",
    description: "A custom style used by the menu tests.",
    keepCodingInstructions: true,
    instructions: "Custom instruction body.",
    source: "user",
    ...overrides,
  };
}

function mixedRegistry(): StyleRegistry {
  return mergeStyleSources(
    createBuiltinRegistry(),
    [customStyle({ id: "user-style", name: "User Style", source: "user" })],
    [customStyle({ id: "project-style", name: "Project Style", source: "project" })],
  ).registry;
}

function createMenu(
  registry: StyleRegistry,
  overrides: { activeStyleId?: string; getForce?: () => StyleMenuForce | undefined } = {},
): StyleMenu {
  return new StyleMenu({
    registry,
    theme: fakeTheme(),
    activeStyleId: overrides.activeStyleId ?? "default",
    getForce: overrides.getForce,
    done: () => undefined,
    requestRender: () => undefined,
  });
}

describe("StyleMenu detail panel", () => {
  it("shows the selected style description and real status metadata", () => {
    const output = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" }).render(120).join("\n");

    expect(output).toContain("Answer with the result first, without preamble or narration.");
    expect(output).toContain("turn reminder: yes");
    expect(output).toContain("keep-coding: on");
    expect(output).not.toContain("turn reminder: no");
    expect(output).not.toContain("Active style");
    expect(output).not.toContain("Act immediately");
  });

  it("reports the default style without reminders, keep-coding or a source path", () => {
    const output = createMenu(createBuiltinRegistry()).render(120).join("\n");

    expect(output).toContain("Use Pi's normal response behavior without additional style guidance.");
    expect(output).toContain("turn reminder: no · keep-coding: off");
    expect(output).not.toContain("waiting reminder");
    expect(output).not.toContain("from ");
  });

  it("reports the waiting-turn limitation and source path for custom styles", () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        customStyle({
          id: "team",
          name: "Team",
          source: "user",
          filePath: ".pi/output-styles/team.md",
          turnReminder: "Keep replies in the team voice.",
          waitingTurnReminder: "Wrap up when only waiting work remains.",
        }),
      ],
      [],
    ).registry;

    const output = createMenu(registry, { activeStyleId: "team" }).render(120).join("\n");

    expect(output).toContain("turn reminder: yes");
    expect(output).toContain("waiting reminder: unavailable (Pi)");
    expect(output).toContain("keep-coding: on");
    expect(output).toContain("from .pi/output-styles/team.md");
  });
});

describe("StyleMenu list rows", () => {
  it("renders the built-in rows with the active marker and origin", () => {
    const lines = createMenu(createBuiltinRegistry()).render(120);
    const output = lines.join("\n");

    expect(output).toContain("* default built-in");
    expect(output).toContain("  Proactive built-in");
    expect(output).toContain("  Concise built-in");
    expect(output).toContain("  Explanatory built-in");
    expect(output).toContain("  Learning built-in");
    expect(output).not.toContain("* Concise");
  });

  it("marks the persisted active style instead of the first row", () => {
    const lines = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" }).render(120);
    const output = lines.join("\n");

    expect(output).toContain("* Concise built-in");
    expect(output).toContain("  default built-in");
  });

  it("shows the user and project origins for custom styles", () => {
    const lines = createMenu(mixedRegistry()).render(120);
    const output = lines.join("\n");

    expect(output).toContain("  User Style user");
    expect(output).toContain("  Project Style project");
  });

  it.each([40, 79, 80, 120])("keeps every rendered line within width %i", (width) => {
    for (const lines of [
      createMenu(createBuiltinRegistry()).render(width),
      createMenu(mixedRegistry(), { activeStyleId: "concise" }).render(width),
    ]) {
      for (const line of lines) {
        expect(renderedWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("handles wide characters in names without exceeding the width", () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [customStyle({ id: "wide", name: "日本語スタイル", source: "user" })],
      [],
    ).registry;

    for (const width of [40, 79, 80, 120]) {
      const lines = createMenu(registry).render(width);
      expect(lines.join("\n")).toContain("日本語スタイル user");
      for (const line of lines) {
        expect(renderedWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("StyleMenu forced state", () => {
  function forcedMenu() {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    const requestRender = vi.fn();
    const done = vi.fn();
    const menu = new StyleMenu({
      registry: createBuiltinRegistry(),
      theme: fakeTheme(),
      activeStyleId: "default",
      getForce: () => controller.activeForce(),
      done,
      requestRender,
    });
    return { controller, done, menu, requestRender };
  }

  it("renders the banner from the live controller and mutes every row while forced", () => {
    const { controller, menu } = forcedMenu();
    controller.force("plugin-a", "concise");

    const lines = menu.render(120);
    const output = lines.join("\n");

    expect(output).toContain("Forced by plugin-a — selection overridden");
    expect(output).not.toContain("[accent]");
    for (const line of lines) {
      if (line.includes("built-in")) {
        expect(line).toContain("[muted]");
      }
    }
  });

  it("keeps every banner line within the render width", () => {
    const { controller, menu } = forcedMenu();
    controller.force("plugin-a", "concise");

    for (const width of [40, 79, 80, 120]) {
      for (const line of menu.render(width)) {
        expect(renderedWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("drops the banner and restores row colors after the force is released", () => {
    const { controller, menu } = forcedMenu();
    const force = controller.force("plugin-a", "concise");
    expect(menu.render(120).join("\n")).toContain("Forced by plugin-a");

    force.release();
    menu.handleInput("\x1b[B");

    const output = menu.render(120).join("\n");
    expect(output).not.toContain("Forced by");
    expect(output).toContain("[accent]  Proactive built-in[/]");
  });

  it("keeps Enter inert while forced and applies it again after release", () => {
    const { controller, done, menu } = forcedMenu();
    const force = controller.force("plugin-a", "concise");

    menu.handleInput("\r");
    expect(done).not.toHaveBeenCalled();

    force.release();
    menu.handleInput("\r");
    expect(done).toHaveBeenCalledWith("default");
  });

  it("shows no banner and normal row colors when nothing forces a style", () => {
    const { menu } = forcedMenu();

    const output = menu.render(120).join("\n");

    expect(output).not.toContain("Forced by");
    expect(output).toContain("[accent]* default built-in[/]");
  });
});

describe("StyleMenu responsive layout", () => {
  it("collapses below 80 columns with the active row description inside the list", () => {
    const lines = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" }).render(79);
    const output = lines.join("\n");

    expect(output).toContain("Answer with the result first, without preamble or narration.");
    expect(output).not.toContain("turn reminder");
    expect(output).not.toContain("Act immediately");
    expect(output).not.toContain("Stop and ask the human");
    for (const line of lines) {
      expect(renderedWidth(line)).toBeLessThanOrEqual(79);
    }
  });

  it("restores the two detail zones from 80 columns", () => {
    const output = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" }).render(80).join("\n");

    expect(output).toContain("turn reminder: yes");
    expect(output).toContain("Answer with the result");
  });
});

describe("StyleMenu keyboard", () => {
  function keyboardMenu() {
    const requestRender = vi.fn();
    const done = vi.fn();
    const menu = new StyleMenu({
      registry: createBuiltinRegistry(),
      theme: fakeTheme(),
      activeStyleId: "default",
      done,
      requestRender,
    });
    return { menu, done, requestRender };
  }

  it("moves the cursor with bounded arrows and refreshes the detail on the next render", () => {
    const { menu, requestRender } = keyboardMenu();

    menu.handleInput("\x1b[A");
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(menu.render(120).join("\n")).toContain(
      "Use Pi's normal response behavior without additional style guidance.",
    );

    menu.handleInput("\x1b[B");
    expect(requestRender).toHaveBeenCalledTimes(2);
    const moved = menu.render(120).join("\n");
    expect(moved).toContain("Act immediately, keep interruptions to a minimum");
    expect(moved).toContain("[accent]  Proactive built-in[/]");
    expect(moved).not.toContain("Use Pi's normal response behavior");

    for (let step = 0; step < 10; step += 1) {
      menu.handleInput("\x1b[B");
    }
    expect(menu.render(120).join("\n")).toContain("Stop and ask the human to write small pieces of code");

    for (let step = 0; step < 10; step += 1) {
      menu.handleInput("\x1b[A");
    }
    expect(menu.render(120).join("\n")).toContain("[accent]* default built-in[/]");
    expect(requestRender).toHaveBeenCalledTimes(22);
  });

  it("delivers the active row on Enter and null on Escape, requesting a render each time", () => {
    const { menu, done, requestRender } = keyboardMenu();

    menu.handleInput("\x1b[B");
    menu.handleInput("\x1b[B");
    menu.handleInput("\r");
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith("concise");
    expect(requestRender).toHaveBeenCalledTimes(3);

    const escaping = keyboardMenu();
    escaping.menu.handleInput("\x1b");
    expect(escaping.done).toHaveBeenCalledWith(null);
    expect(escaping.requestRender).toHaveBeenCalledTimes(1);
  });

  it("ignores keys it does not handle", () => {
    const { menu, done, requestRender } = keyboardMenu();

    menu.handleInput("x");

    expect(done).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
