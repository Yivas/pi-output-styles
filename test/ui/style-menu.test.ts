import { describe, expect, it, vi } from "vitest";
import { sliceByColumn, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import {
  StyleMenu,
  detailZoneStart,
  type StyleMenuForce,
  type StyleMenuTheme,
} from "../../src/ui/style-menu.js";
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

// Detail-zone text with terminal sequences and theme tags removed, split into
// tokens, so wrapped body fragments can be matched back against the source
// instructions verbatim. Only the detail column is taken: the list zone shares
// the same rendered rows.
function detailTokens(lines: string[], width: number): string[] {
  const start = detailZoneStart(width);
  const detail = lines.map((line) => sliceByColumn(line, start, width - start)).join("\n");
  return stripTerminalSequences(detail)
    .replace(/\[(?:accent|border|dim|muted|text|warning)\]|\[\/\]/g, "")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function containsTokenRun(tokens: string[], run: string[]): boolean {
  for (let start = 0; start + run.length <= tokens.length; start += 1) {
    if (run.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
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
  overrides: {
    activeStyleId?: string;
    getForce?: () => StyleMenuForce | undefined;
    maxHeight?: () => number;
  } = {},
): StyleMenu {
  return new StyleMenu({
    registry,
    theme: fakeTheme(),
    activeStyleId: overrides.activeStyleId ?? "default",
    getForce: overrides.getForce,
    maxHeight: overrides.maxHeight ?? (() => 40),
    done: () => undefined,
    requestRender: () => undefined,
  });
}

function bodyMenu(instructions: string, maxHeight = 40): StyleMenu {
  const registry = mergeStyleSources(
    createBuiltinRegistry(),
    [customStyle({ id: "body-style", name: "Body Style", instructions })],
    [],
  ).registry;
  return createMenu(registry, { activeStyleId: "body-style", maxHeight: () => maxHeight });
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
      maxHeight: () => 40,
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
      maxHeight: () => 40,
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

describe("StyleMenu instructions body", () => {
  const leadLine =
    "Lead body line long enough to wrap into several fragments inside the narrow detail column at every supported width.";
  const wideLine = "日本語 の 説明 行 を 含み ます 。";
  const instructionsFixture = [leadLine, wideLine, "Final short body line."].join("\n");

  it("shows the complete wrapped body, including wide characters, at 80 and 120 columns", () => {
    const bodyTokens = instructionsFixture.split(/\s+/);

    for (const width of [80, 120]) {
      const lines = bodyMenu(instructionsFixture).render(width);
      const output = lines.join("\n");

      expect(containsTokenRun(detailTokens(lines, width), bodyTokens)).toBe(true);
      expect(output).toContain("日本語");
      // The lead line is wider than the detail column, so it must arrive wrapped.
      expect(output).not.toContain(leadLine);
      for (const line of lines) {
        expect(renderedWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("keeps other styles' bodies out of the detail while navigating", () => {
    const menu = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" });
    const first = menu.render(120).join("\n");
    expect(first).toContain("Never trade correctness for brevity");
    expect(first).not.toContain("Add one insight block before writing code");

    menu.handleInput("\x1b[B");

    const moved = menu.render(120).join("\n");
    expect(moved).toContain("Add one insight block before writing code");
    expect(moved).not.toContain("Never trade correctness for brevity");
  });

  it("drops the body below 80 columns and keeps the description in the row", () => {
    const lines = createMenu(createBuiltinRegistry(), { activeStyleId: "concise" }).render(79);
    const output = lines.join("\n");

    expect(output).toContain("Answer with the result first, without preamble or narration.");
    expect(output).not.toContain("Never trade correctness for brevity");
    for (const line of lines) {
      expect(renderedWidth(line)).toBeLessThanOrEqual(79);
    }
  });

  it("windows a 200+ line body within the height budget at 80 and 120 columns", () => {
    const longBody = Array.from(
      { length: 210 },
      (_, index) => `Line ${index} of the long instructions body with several words to wrap.`,
    ).join("\n");
    const firstTokens = longBody.split("\n")[0]!.split(/\s+/);
    const lastTokens = longBody.split("\n")[209]!.split(/\s+/);

    for (const width of [80, 120]) {
      const lines = bodyMenu(longBody, 24).render(width);
      const tokens = detailTokens(lines, width);
      expect(containsTokenRun(tokens, firstTokens)).toBe(true);
      expect(containsTokenRun(tokens, lastTokens)).toBe(false);
      expect(lines.length).toBeLessThanOrEqual(24);
      for (const line of lines) {
        expect(renderedWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("StyleMenu height budget and scrolling", () => {
  const longBody = Array.from(
    { length: 210 },
    (_, index) => `Line ${index} of the long instructions body with several words to wrap.`,
  ).join("\n");
  const firstTokens = longBody.split("\n")[0]!.split(/\s+/);
  const lastTokens = longBody.split("\n")[209]!.split(/\s+/);

  function longBodyMenu(maxHeight: number): StyleMenu {
    return bodyMenu(longBody, maxHeight);
  }

  function wheelEvent(wheelDelta: number): TuiMouseEvent {
    return {
      type: "wheel",
      button: "none",
      x: 5,
      y: 5,
      screenX: 5,
      screenY: 5,
      width: 80,
      height: 24,
      shift: false,
      alt: false,
      ctrl: false,
      wheelDelta,
    };
  }

  it.each([24, 40])("keeps the status line, footer and borders on screen within %i rows", (budget) => {
    const lines = longBodyMenu(budget).render(80);
    const output = lines.join("\n");

    expect(output).toContain("turn reminder:");
    expect(output).toContain("keep-coding: on");
    expect(output).toContain("↑↓ · Enter · Esc");
    expect(lines.length).toBeLessThanOrEqual(budget);
  });

  it.each([24, 40])(
    "reaches the tail of a 210-line body and comes back with PageDown/PageUp in %i rows",
    (budget) => {
      const menu = longBodyMenu(budget);
      const width = 80;

      const initial = detailTokens(menu.render(width), width);
      expect(containsTokenRun(initial, firstTokens)).toBe(true);
      expect(containsTokenRun(initial, lastTokens)).toBe(false);

      let pages = 0;
      while (!containsTokenRun(detailTokens(menu.render(width), width), lastTokens) && pages < 100) {
        menu.handleInput("\x1b[6~");
        pages += 1;
      }
      const atEnd = menu.render(width);
      expect(containsTokenRun(detailTokens(atEnd, width), lastTokens)).toBe(true);
      expect(containsTokenRun(detailTokens(atEnd, width), firstTokens)).toBe(false);
      expect(atEnd.join("\n")).toContain("turn reminder:");
      expect(atEnd.length).toBeLessThanOrEqual(budget);

      let returns = 0;
      while (!containsTokenRun(detailTokens(menu.render(width), width), firstTokens) && returns < 100) {
        menu.handleInput("\x1b[5~");
        returns += 1;
      }
      const backAtTop = menu.render(width);
      expect(containsTokenRun(detailTokens(backAtTop, width), firstTokens)).toBe(true);
      expect(backAtTop.length).toBeLessThanOrEqual(budget);
    },
  );

  it("jumps to the end and back of the body with End and Home", () => {
    const menu = longBodyMenu(24);
    const width = 80;
    menu.render(width); // The overlay paints before any key reaches the menu.

    menu.handleInput("\x1b[F");
    const atEnd = menu.render(width);
    expect(containsTokenRun(detailTokens(atEnd, width), lastTokens)).toBe(true);
    expect(atEnd.join("\n")).toContain("turn reminder:");

    menu.handleInput("\x1b[H");
    expect(containsTokenRun(detailTokens(menu.render(width), width), firstTokens)).toBe(true);
  });

  it("documents the body scroll keys in the footer next to the base keys", () => {
    const expanded = longBodyMenu(24).render(80).join("\n");
    expect(expanded).toContain("↑↓ · Enter · Esc");
    expect(expanded).toContain("PgUp/PgDn");
    expect(expanded).toContain("Home/End");

    const collapsed = longBodyMenu(24).render(79).join("\n");
    expect(collapsed).toContain("↑↓ · Enter · Esc");
    expect(collapsed).not.toContain("PgUp/PgDn");
  });

  it.each([
    [79, 24],
    [79, 40],
    [40, 24],
    [40, 40],
  ])("fits the collapsed layout at width %i within %i rows", (width, budget) => {
    const lines = longBodyMenu(budget).render(width);

    expect(lines.length).toBeLessThanOrEqual(budget);
    expect(lines.join("\n")).toContain("↑↓ · Enter · Esc");
    expect(lines.join("\n")).not.toContain("turn reminder");
    for (const line of lines) {
      expect(renderedWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  it("consumes wheel events over the menu and scrolls the body", () => {
    const menu = longBodyMenu(24);
    const width = 80;
    menu.render(width);

    expect(menu.handleMouse(wheelEvent(3))).toEqual({ handled: true });
    expect(containsTokenRun(detailTokens(menu.render(width), width), firstTokens)).toBe(false);

    let rolls = 0;
    while (!containsTokenRun(detailTokens(menu.render(width), width), lastTokens) && rolls < 500) {
      menu.handleMouse(wheelEvent(3));
      rolls += 1;
    }
    const atEnd = menu.render(width);
    expect(containsTokenRun(detailTokens(atEnd, width), lastTokens)).toBe(true);
    expect(atEnd.join("\n")).toContain("turn reminder:");
    expect(atEnd.length).toBeLessThanOrEqual(24);

    let rollsBack = 0;
    while (!containsTokenRun(detailTokens(menu.render(width), width), firstTokens) && rollsBack < 500) {
      menu.handleMouse(wheelEvent(-3));
      rollsBack += 1;
    }
    expect(containsTokenRun(detailTokens(menu.render(width), width), firstTokens)).toBe(true);
  });

  it("returns no result for non-wheel mouse events", () => {
    const menu = longBodyMenu(24);
    menu.render(80);

    expect(
      menu.handleMouse({
        ...wheelEvent(0),
        type: "press",
        button: "left",
        wheelDelta: undefined,
      }),
    ).toBeUndefined();
  });

  it("leaves the list selection untouched on scroll keys", () => {
    const menu = longBodyMenu(24);

    menu.handleInput("\x1b[6~");
    menu.handleInput("\x1b[F");

    expect(menu.render(80).join("\n")).toContain("* Body Style user");
  });

  it("starts the next style's body from the top after scrolling and moving the cursor", () => {
    const alphaBody = Array.from(
      { length: 210 },
      (_, index) => `Alpha line ${index} with several words to wrap across the body.`,
    ).join("\n");
    const betaBody = Array.from(
      { length: 210 },
      (_, index) => `Beta line ${index} with several words to wrap across the body.`,
    ).join("\n");
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        customStyle({ id: "alpha-body", name: "Alpha Body", instructions: alphaBody }),
        customStyle({ id: "beta-body", name: "Beta Body", instructions: betaBody }),
      ],
      [],
    ).registry;
    const menu = createMenu(registry, { activeStyleId: "alpha-body", maxHeight: () => 24 });
    const width = 80;
    menu.render(width); // The overlay paints before any key reaches the menu.

    menu.handleInput("\x1b[F");
    const alphaTokens = detailTokens(menu.render(width), width);
    expect(containsTokenRun(alphaTokens, "Alpha line 209 with several words to wrap across the body.".split(/\s+/))).toBe(true);

    menu.handleInput("\x1b[B");
    const betaTokens = detailTokens(menu.render(width), width);
    expect(containsTokenRun(betaTokens, "Beta line 0 with several words to wrap across the body.".split(/\s+/))).toBe(true);
    expect(containsTokenRun(betaTokens, "Beta line 209 with several words to wrap across the body.".split(/\s+/))).toBe(false);
  });
});
