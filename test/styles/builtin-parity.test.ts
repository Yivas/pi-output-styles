import { describe, expect, it } from "vitest";
import { BUILTIN_STYLES } from "../../src/styles/builtin.js";
import type { StyleDefinition } from "../../src/styles/types.js";

const styles: Record<string, StyleDefinition | undefined> = Object.fromEntries(
  BUILTIN_STYLES.map((style) => [style.id, style]),
);

function numberedRuleMarkers(instructions: string): string[] {
  return instructions.match(/^\d+\./gm) ?? [];
}

function lastBlock(instructions: string): string {
  const blocks = instructions.split(/\n\s*\n/);
  return (blocks[blocks.length - 1] ?? "").trim();
}

function expectNoReminders(style: StyleDefinition | undefined): void {
  expect(style?.turnReminder).toBeUndefined();
  expect(style?.waitingTurnReminder).toBeUndefined();
}

describe("built-in style parity", () => {
  it("default is pure: no instructions, no coding block, no reminders, own description", () => {
    const style = styles["default"];

    expect(style).toBeDefined();
    expect(style?.description.trim().length).toBeGreaterThan(0);
    expect(style?.instructions).toBe("");
    expect(style?.keepCodingInstructions).toBe(false);
    expectNoReminders(style);
  });

  it("Proactive declares both reminders and an active-style section with six numbered rules", () => {
    const style = styles["proactive"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.instructions).toMatch(/^### Active style/m);
    expect(numberedRuleMarkers(style?.instructions ?? "")).toEqual([
      "1.",
      "2.",
      "3.",
      "4.",
      "5.",
      "6.",
    ]);
  });

  it("Concise declares a turn reminder with six numbered rules and a final precedence clause", () => {
    const style = styles["concise"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    expect(numberedRuleMarkers(style?.instructions ?? "")).toEqual([
      "1.",
      "2.",
      "3.",
      "4.",
      "5.",
      "6.",
    ]);
    const closing = lastBlock(style?.instructions ?? "");
    expect(closing).toMatch(/precedence/i);
    expect(closing).not.toMatch(/^\d+\./);
  });

  it("Explanatory has an educational frame and a delimited insight mechanism with 2-3 points", () => {
    const style = styles["explanatory"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    expect(style?.instructions).toMatch(/^### Educational frame/m);
    expect(style?.instructions).toContain("`★ Insight ─────────────────────────────────────`");
    expect(style?.instructions).toContain("`─────────────────────────────────────────────────`");
    expect(style?.instructions).not.toContain("> **Insight**");
    expect(style?.instructions).toMatch(/\b2-3\b/);
    expect(style?.instructions).toMatch(/anchored to this project's code/i);
    expect(style?.instructions).toMatch(/before writing code/i);
    expect(style?.instructions).toMatch(/after writing code/i);
    expect(style?.instructions).toMatch(/anchored to this project's code or to what you just wrote/i);
    expect(style?.instructions).toMatch(/in the conversation/i);
    expect(style?.instructions).toMatch(/never (written )?into the code/i);
  });

  it("Learning has the collaborative frame and the full human contribution protocol", () => {
    const style = styles["learning"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/^### Collaborative frame/m);
    // Contribution thresholds: pieces of 2-10 lines out of generated runs of 20+ lines.
    expect(instructions).toMatch(/\b2-10\b/);
    expect(instructions).toMatch(/\b20\+/);
    // Task-list integration marker.
    expect(instructions).toMatch(/Ask for human input on \[decision\]/);
    // Three-field request block.
    expect(instructions).toContain("**Context:**");
    expect(instructions).toContain("**Your task:**");
    expect(instructions).toContain("**Guidance:**");
    // TODO(human) marker rules: inserted before, exactly one, wait after the request.
    expect(instructions).toContain("TODO(human)");
    expect(instructions).toMatch(/exactly one `?TODO\(human\)`?/);
    expect(instructions).toMatch(/insert the TODO\(human\) marker/i);
    expect(instructions).toMatch(/emit nothing else and wait/i);
    // Own example requests: two to three, covering complete function, partial
    // function, and debugging scenarios.
    const exampleCount = (instructions.match(/^Example \d+/gm) ?? []).length;
    expect(exampleCount).toBeGreaterThanOrEqual(2);
    expect(exampleCount).toBeLessThanOrEqual(3);
    expect(instructions).toMatch(/^Example 1[^\n]*complete function/im);
    expect(instructions).toMatch(/^Example 2[^\n]*partial function/im);
    expect(instructions).toMatch(/^Example 3[^\n]*debugging/im);
    // Closing: no praise, plus the shared insight mechanism in the drawn box.
    expect(instructions).toMatch(/no praise/i);
    expect(instructions).toContain("`★ Insight ─────────────────────────────────────`");
    expect(instructions).toContain("`─────────────────────────────────────────────────`");
    expect(instructions).not.toContain("> **Insight**");
    expect(instructions).toMatch(/\b2-3\b/);
    expect(instructions).toMatch(/in the conversation only/i);
    // The closing idea is our own wording: the reference's run of words stays out.
    expect(instructions).not.toMatch(/broader patterns or system effects/i);
  });

  it("Reviewer has the review lens, six numbered rules and a turn reminder", () => {
    const style = styles["reviewer"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";
    expect(instructions).toMatch(/^### Review lens/m);
    expect(numberedRuleMarkers(instructions)).toEqual(["1.", "2.", "3.", "4.", "5.", "6."]);
    expect(instructions).toMatch(/edge cases/i);
    expect(instructions).toMatch(/security/i);
    expect(instructions).toMatch(/performance/i);
    expect(instructions).toMatch(/assumptions/i);
    expect(instructions).toMatch(/what could break/i);
    expect(instructions).toMatch(/how to verify/i);
    expect(instructions).toMatch(/no praise/i);
  });

  it("Diagrams first opens explanations with mermaid and bounded diagrams", () => {
    const style = styles["diagrams-first"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";
    expect(instructions).toMatch(/mermaid/i);
    expect(instructions).toMatch(/flowchart TD/);
    expect(instructions).toMatch(/sequenceDiagram/);
    expect(instructions).toMatch(/15 nodes/);
    expect(instructions).toMatch(/real code/i);
    expect(instructions).toMatch(/trivial/i);
  });

  it("STE declares the ASD-STE100 rules, the action-first reply shape and its exceptions", () => {
    const style = styles["ste"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";
    expect(instructions).toMatch(/ASD-STE100/);
    expect(instructions).toMatch(/does not govern code/i);
    expect(instructions).toMatch(/log output/i);
    expect(instructions).toMatch(/20 words/);
    expect(instructions).toMatch(/25 words/);
    expect(instructions).toMatch(/active voice/i);
    expect(instructions).toMatch(/no semicolons/i);
    expect(instructions).toMatch(/no contractions/i);
    expect(instructions).toMatch(/first line/i);
    expect(instructions).toMatch(/explanation/i);
    expect(instructions).toMatch(/destructive/i);
    expect(instructions).toMatch(/ambiguous/i);
    expect(instructions).toMatch(/self-check/i);
  });

  it("Caveman keeps five terse rules with exact technical tokens and safety carve-outs", () => {
    const style = styles["caveman"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";
    expect(numberedRuleMarkers(instructions)).toEqual(["1.", "2.", "3.", "4.", "5."]);
    expect(instructions).toMatch(/fragments/i);
    expect(instructions).toMatch(/filler/i);
    expect(instructions).toMatch(/paths/);
    expect(instructions).toMatch(/stay exact/i);
    expect(instructions).toMatch(/scanning/i);
    expect(instructions).toMatch(/irreversible/i);
    expect(instructions).toMatch(/safety/i);
  });

  it("ELI5 reports the essentials in plain words and caps decisions at two options", () => {
    const style = styles["eli5"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";
    expect(instructions).toMatch(/what you did/i);
    expect(instructions).toMatch(/whether it worked/i);
    expect(instructions).toMatch(/what to do now/i);
    expect(instructions).toMatch(/two options/i);
    expect(instructions).toMatch(/which one you would take/i);
    expect(instructions).toMatch(/paths and commands stay exact/i);
    expect(instructions).toMatch(/never simplify away correctness/i);
  });

  it("matches the reminder metadata table: seven built-ins declare a turn reminder and only Proactive declares a waiting one", () => {
    for (const styleId of ["proactive", "concise", "reviewer", "diagrams-first", "ste", "caveman", "eli5"]) {
      expect(styles[styleId]?.turnReminder).toBeDefined();
    }
    for (const styleId of ["concise", "reviewer", "diagrams-first", "ste", "caveman", "eli5"]) {
      expect(styles[styleId]?.waitingTurnReminder).toBeUndefined();
    }
    expect(styles["proactive"]?.waitingTurnReminder).toBeDefined();
    expectNoReminders(styles["default"]);
    expectNoReminders(styles["explanatory"]);
    expectNoReminders(styles["learning"]);
  });
});
