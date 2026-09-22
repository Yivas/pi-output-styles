import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeStyleId, parseStyleFile } from "../../src/styles/parser.js";
import type { StyleDefinition } from "../../src/styles/types.js";

const fixturesDirectory = fileURLToPath(new URL("../fixtures/styles/", import.meta.url));

async function readFixture(name: string): Promise<string> {
  return readFile(`${fixturesDirectory}${name}`, "utf8");
}

describe("parseStyleFile", () => {
  it("parses required frontmatter and preserves the body literally", async () => {
    const text = await readFixture("valid.md");

    const style: StyleDefinition = parseStyleFile(text, "valid.md");

    expect(style).toEqual({
      id: "focused-review",
      name: "Focused Review",
      description: "Keeps implementation reviews focused and actionable.",
      keepCodingInstructions: true,
      instructions: "Return the findings first.\n\nPreserve this spacing and punctuation: *literal*.\n",
      source: "file",
    });
  });

  it("parses optional turn reminders and preserves the body", async () => {
    const style = parseStyleFile(await readFixture("with-reminders.md"), "with-reminders.md");

    expect(style).toEqual({
      id: "reminders",
      name: "Reminders",
      description: "Keeps each turn aligned with the selected style.",
      keepCodingInstructions: true,
      instructions: "Keep the response aligned with the selected style.\n",
      source: "file",
      turnReminder: "Review the selected style before answering.",
      waitingTurnReminder: "Wait for the background work to finish.",
    });
  });

  it("omits optional turn reminders when the fields are absent", async () => {
    const style = parseStyleFile(
      await readFixture("without-reminders.md"),
      "without-reminders.md",
    );

    expect(style).toEqual({
      id: "without-reminders",
      name: "Without Reminders",
      description: "Does not declare turn reminders.",
      keepCodingInstructions: false,
      instructions: "No reminder is configured.\n",
      source: "file",
    });
    expect(style.turnReminder).toBeUndefined();
    expect(style.waitingTurnReminder).toBeUndefined();
  });

  it("treats empty turn reminders as absent", () => {
    const style = parseStyleFile(
      `---\nname: Empty Reminders\ndescription: Empty values are ignored.\nkeep-coding-instructions: true\nturn-reminder:\nwaiting-turn-reminder: ""\n---\nBody`,
      "empty-reminders.md",
    );

    expect(style.turnReminder).toBeUndefined();
    expect(style.waitingTurnReminder).toBeUndefined();
    expect(style.instructions).toBe("Body");
  });

  it("rejects non-string turn reminders", () => {
    const invalidValues = [
      "turn-reminder: 42",
      "waiting-turn-reminder: [one, two]",
      "turn-reminder: {key: value}",
      "waiting-turn-reminder: true",
    ];

    for (const field of invalidValues) {
      expect(() => parseStyleFile(
        `---\nname: Invalid Reminder\ndescription: Invalid value.\nkeep-coding-instructions: true\n${field}\n---\nBody`,
        "invalid-reminder.md",
      )).toThrow(/turn-reminder|waiting-turn-reminder/i);
    }
  });

  it("parses a default style with an empty body", async () => {
    const style = parseStyleFile(await readFixture("default.md"), "default.md");

    expect(style.id).toBe("default");
    expect(style.instructions).toBe("");
    expect(style.keepCodingInstructions).toBe(false);
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseStyleFile("Instructions only", "missing-frontmatter.md")).toThrow(
      /frontmatter/i,
    );
  });

  it("rejects invalid YAML", () => {
    expect(() => parseStyleFile("---\nname: Broken\nnot yaml\n---\nBody", "invalid.md")).toThrow(
      /YAML|frontmatter/i,
    );
  });

  it("rejects missing required fields", () => {
    expect(() => parseStyleFile("---\nname: Missing description\n---\nBody", "missing-field.md")).toThrow(
      /description/i,
    );
  });

  it("requires a strict boolean for keep-coding-instructions", () => {
    expect(() => parseStyleFile(
      "---\nname: Loose\ndescription: Test\nkeep-coding-instructions: yes\n---\nBody",
      "invalid-boolean.md",
    )).toThrow(/keep-coding-instructions/i);
  });

  it("normalizes identifiers explicitly without changing the displayed name", () => {
    expect(normalizeStyleId("  Focused Review ")).toBe("focused-review");
    expect(normalizeStyleId("A/B: Test")).toBe("a-b-test");
  });
});
