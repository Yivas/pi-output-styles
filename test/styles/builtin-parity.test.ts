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
    expect(style?.instructions).toContain("> **Insight**");
    expect(style?.instructions).toMatch(/\b2-3\b/);
    expect(style?.instructions).toMatch(/before writing code/i);
    expect(style?.instructions).toMatch(/after writing code/i);
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
    // Closing: no praise, plus the shared insight mechanism.
    expect(instructions).toMatch(/no praise/i);
    expect(instructions).toContain("> **Insight**");
    expect(instructions).toMatch(/\b2-3\b/);
  });

  it("matches the reminder metadata table: only Proactive and Concise declare reminders", () => {
    expect(styles["proactive"]?.turnReminder).toBeDefined();
    expect(styles["proactive"]?.waitingTurnReminder).toBeDefined();
    expect(styles["concise"]?.turnReminder).toBeDefined();
    expect(styles["concise"]?.waitingTurnReminder).toBeUndefined();
    expectNoReminders(styles["default"]);
    expectNoReminders(styles["explanatory"]);
    expectNoReminders(styles["learning"]);
  });
});
