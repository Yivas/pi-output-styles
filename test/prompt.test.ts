import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  appendStyleInstructions,
  composeStylePrompt,
  registerSystemPromptHook,
} from "../src/prompt.js";
import { BASE_CODING_INSTRUCTIONS } from "../src/styles/coding-instructions.js";
import { parseStyleFile } from "../src/styles/parser.js";
import { createBuiltinRegistry } from "../src/styles/registry.js";
import type { StyleDefinition } from "../src/styles/types.js";

const fixturesDirectory = fileURLToPath(new URL("fixtures/styles/", import.meta.url));

async function readStyleFixture(name: string): Promise<StyleDefinition> {
  const text = await readFile(`${fixturesDirectory}${name}`, "utf8");
  return parseStyleFile(text, name);
}

const defaultStyle: StyleDefinition = {
  id: "default",
  name: "default",
  description: "Normal response behavior.",
  keepCodingInstructions: false,
  instructions: "",
  source: "builtin",
};

const conciseStyle: StyleDefinition = {
  id: "concise",
  name: "Concise",
  description: "Keep responses focused.",
  keepCodingInstructions: true,
  instructions: "Put the result first and keep the response compact.",
  source: "builtin",
};

describe("appendStyleInstructions", () => {
  it("leaves the prompt exactly unchanged for default", () => {
    const prompt = "Native instructions\n\nEarlier extension instructions";

    expect(appendStyleInstructions(prompt, defaultStyle)).toBe(prompt);
  });

  it("adds a distinct style block after the chained prompt", () => {
    const prompt = "Native instructions\n\nEarlier extension instructions";

    expect(appendStyleInstructions(prompt, conciseStyle)).toBe(
      `${prompt}\n\n## Output style: Concise\n\nPut the result first and keep the response compact.`,
    );
  });
});

describe("composeStylePrompt", () => {
  it("leaves the system prompt untouched for the built-in default style", () => {
    const builtinDefault = createBuiltinRegistry().resolve("default");
    if (!builtinDefault) {
      throw new Error("The default built-in style is missing");
    }
    const prompt = "Native instructions\n\nEarlier extension instructions";
    const composed = composeStylePrompt(prompt, builtinDefault, BASE_CODING_INSTRUCTIONS);

    expect(composed).toBe(prompt);
    expect(composed).not.toContain(BASE_CODING_INSTRUCTIONS);
    expect(composed).not.toContain("## Output style:");
  });

  it("keeps the base coding block and adds the style body once when enabled", async () => {
    const style = await readStyleFixture("keep-coding-true.md");
    const prompt = "Native instructions\n\nEarlier extension instructions";

    expect(style.turnReminder).toBeUndefined();
    expect(style.waitingTurnReminder).toBeUndefined();
    expect(composeStylePrompt(prompt, style, BASE_CODING_INSTRUCTIONS)).toBe(
      `${prompt}\n\n## Coding instructions\n\n${BASE_CODING_INSTRUCTIONS}\n\n## Output style: Keep Coding True\n\nKeep this style body exactly once.\n`,
    );
  });

  it("omits only the extension-owned base coding block when disabled", async () => {
    const style = await readStyleFixture("keep-coding-false.md");
    const prompt = "Native instructions\n\nEarlier extension instructions";

    expect(style.turnReminder).toBeUndefined();
    expect(style.waitingTurnReminder).toBeUndefined();
    const composed = composeStylePrompt(prompt, style, BASE_CODING_INSTRUCTIONS);

    expect(composed).toBe(
      `${prompt}\n\n## Output style: Keep Coding False\n\nOmit only the extension-owned coding block.\n`,
    );
    expect(composed).toContain("Native instructions");
    expect(composed).toContain("Earlier extension instructions");
    expect(composed).not.toContain(BASE_CODING_INSTRUCTIONS);
  });
});

describe("registerSystemPromptHook", () => {
  it("registers only before_agent_start and preserves earlier extension text", async () => {
    const registrations: string[] = [];
    let handler:
      | ((event: BeforeAgentStartEvent, ctx: ExtensionContext) => unknown)
      | undefined;
    const extensionApi = {
      on(event: string, registeredHandler: typeof handler) {
        registrations.push(event);
        handler = registeredHandler;
        return () => {};
      },
    } as unknown as ExtensionAPI;

    registerSystemPromptHook(
      extensionApi,
      {
        list: () => [defaultStyle, conciseStyle],
        resolve: (id) => (id === conciseStyle.id ? conciseStyle : defaultStyle),
      },
      () => "concise",
    );

    expect(registrations).toEqual(["before_agent_start"]);
    expect(handler).toBeDefined();

    const result = await handler?.(
      {
        type: "before_agent_start",
        prompt: "User request",
        systemPrompt: "Native instructions\n\nEarlier extension instructions",
        systemPromptOptions: {} as BeforeAgentStartEvent["systemPromptOptions"],
      },
      {} as ExtensionContext,
    );

    expect(result).toEqual({
      systemPrompt:
        `Native instructions\n\nEarlier extension instructions\n\n## Coding instructions\n\n${BASE_CODING_INSTRUCTIONS}\n\n## Output style: Concise\n\nPut the result first and keep the response compact.`,
    });
  });
});
