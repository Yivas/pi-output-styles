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

  it("Proactive covers decision behaviour in six numbered rules and keeps only the waiting reminder", () => {
    const style = styles["proactive"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder).toBeUndefined();
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
    const instructions = style?.instructions ?? "";
    // Acts inside the turn and asks only where the answer changes the result.
    expect(instructions).toMatch(/start the work in the same turn/i);
    expect(instructions).toMatch(/ask only when the answer changes what gets built/i);
    // Assumptions are surfaced instead of being turned into questions.
    expect(instructions).toMatch(/assumptions you took/i);
    // Safety and disclosure guardrails survive the rewrite.
    expect(instructions).toMatch(/explicit yes/i);
    expect(instructions).toMatch(/never share a secret/i);
  });

  it("Concise states what a reply contains, its form and a precedence clause, in four numbered rules", () => {
    const style = styles["concise"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/^### What a reply contains/m);
    expect(instructions).toMatch(/^### Form$/m);
    expect(numberedRuleMarkers(instructions)).toEqual(["1.", "2.", "3.", "4."]);
    // The contract is positive: outcome, what to act on, one recommendation, verification.
    expect(instructions).toMatch(/the outcome, in the first sentence/i);
    expect(instructions).toMatch(/paths, commands and values/i);
    expect(instructions).toMatch(/one recommendation/i);
    expect(instructions).toMatch(/the verification and what stayed unverified/i);
    // Full-fidelity exceptions stay explicit, in our own wording.
    expect(instructions).toMatch(/failing test's output/i);
    expect(instructions).toMatch(/security warning/i);
    expect(instructions).toMatch(/^### Precedence$/m);
    const closing = lastBlock(instructions);
    expect(closing).toMatch(/explicit request/i);
    expect(closing).toMatch(/arrive complete/i);
    expect(closing).not.toMatch(/^\d+\./);
    // The removed slogans must not come back.
    expect(instructions).not.toMatch(/skip preamble|no preamble|closing recap/i);
  });

  it("Explanatory has an educational frame and a delimited insight mechanism with 2-3 points", () => {
    const style = styles["explanatory"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/^### Educational frame/m);
    expect(instructions).toContain("`★ Insight ─────────────────────────────────────`");
    expect(instructions).toContain("`─────────────────────────────────────────────────`");
    expect(instructions).not.toContain("> **Insight**");
    expect(instructions).toMatch(/\b2-3\b/);
    // The block is tied to a decision worth naming, with the ritual expressed as ordered steps.
    expect(instructions).toMatch(/when the change hides a decision worth naming/i);
    expect(instructions).toMatch(/still gets one block at the end/i);
    expect(instructions).toMatch(/never more than two per turn/i);
    expect(instructions).toMatch(/anchor each point to this project's code/i);
    expect(instructions).toMatch(/in the conversation/i);
    expect(instructions).toMatch(/never written into the code/i);
  });

  it("Learning has the collaborative frame and the full human contribution protocol", () => {
    const style = styles["learning"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/^### Collaborative frame/m);
    // Contribution thresholds: pieces of 2-10 lines out of generated runs of 20+ lines.
    expect(instructions).toMatch(/\b2-10\b/);
    expect(instructions).toMatch(/\b20\+/);
    // Task-list integration and the three-field request block.
    expect(instructions).toMatch(/task list/i);
    expect(instructions).toMatch(/add an item for the hand-over/i);
    expect(instructions).toContain("**Context:**");
    expect(instructions).toContain("**Your task:**");
    expect(instructions).toContain("**Guidance:**");
    // TODO(human) marker rules: inserted before, exactly one, wait after the request.
    expect(instructions).toContain("TODO(human)");
    expect(instructions).toMatch(/exactly one TODO\(human\)/);
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

  it("Reviewer asks for findings with location, severity and evidence, and declares no reminder", () => {
    const style = styles["reviewer"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/^### Review lens/m);
    expect(numberedRuleMarkers(instructions)).toEqual([]);
    expect(instructions).toMatch(/file and line/i);
    expect(instructions).toMatch(/no material findings/i);
    expect(instructions).toMatch(/edge cases/i);
    expect(instructions).toMatch(/security/i);
    expect(instructions).toMatch(/performance/i);
    expect(instructions).toMatch(/severity follows the evidence/i);
    expect(instructions).toMatch(/risky assumption/i);
    expect(instructions).toMatch(/what could break/i);
    expect(instructions).toMatch(/how to verify/i);
    expect(instructions).not.toMatch(/generic review filler/i);
  });

  it("Diagrams first opens explanations with mermaid and bounded diagrams", () => {
    const style = styles["diagrams-first"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expectNoReminders(style);
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/mermaid/i);
    expect(instructions).toMatch(/flowchart TD/);
    expect(instructions).toMatch(/sequenceDiagram/);
    expect(instructions).toMatch(/15 nodes/);
    expect(instructions).toMatch(/real code/i);
    expect(instructions).toMatch(/trivial/i);
    expect(instructions).toMatch(/labels short/i);
  });

  it("STE declares the controlled-English rules, the action-first reply shape and its exceptions", () => {
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
    // The reminder this style used to force as an invented next step is gone.
    expect(instructions).not.toMatch(/under two minutes/i);
  });

  it("Caveman leads with the answer, compresses the grammar and keeps technical tokens and safety", () => {
    const style = styles["caveman"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";

    expect(numberedRuleMarkers(instructions)).toEqual(["1.", "2.", "3.", "4."]);
    expect(instructions).toMatch(/fragments/i);
    expect(instructions).toMatch(/technical tokens exact/i);
    expect(instructions).toMatch(/paths/);
    expect(instructions).toMatch(/scanning/i);
    expect(instructions).toMatch(/irreversible/i);
    expect(instructions).toMatch(/safety/i);
    expect(instructions).toMatch(/lead with the answer/i);
    // The list of banned conversational fillers is gone.
    expect(instructions).not.toMatch(/pleasantries|hedging/i);
  });

  it("ELI5 reports the essentials in plain words and caps decisions at two options", () => {
    const style = styles["eli5"];

    expect(style).toBeDefined();
    expect(style?.keepCodingInstructions).toBe(true);
    expect(style?.turnReminder?.trim().length).toBeGreaterThan(0);
    expect(style?.waitingTurnReminder).toBeUndefined();
    const instructions = style?.instructions ?? "";

    expect(instructions).toMatch(/what happened/i);
    expect(instructions).toMatch(/whether it worked/i);
    expect(instructions).toMatch(/one thing to do now/i);
    expect(instructions).toMatch(/two options/i);
    expect(instructions).toMatch(/which one you would take/i);
    expect(instructions).toMatch(/paths and commands stay exact/i);
    expect(instructions).toMatch(/stay complete/i);
  });

  it("keeps reminders only where the style drifts: four turn reminders and one waiting reminder", () => {
    for (const styleId of ["learning", "ste", "caveman", "eli5"]) {
      expect(styles[styleId]?.turnReminder).toBeDefined();
    }
    for (const styleId of ["default", "proactive", "concise", "explanatory", "reviewer", "diagrams-first"]) {
      expect(styles[styleId]?.turnReminder).toBeUndefined();
    }
    expect(styles["proactive"]?.waitingTurnReminder).toBeDefined();
    for (const styleId of ["default", "concise", "explanatory", "learning", "reviewer", "diagrams-first", "ste", "caveman", "eli5"]) {
      expect(styles[styleId]?.waitingTurnReminder).toBeUndefined();
    }
  });
});
