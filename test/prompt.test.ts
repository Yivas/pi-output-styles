import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  BeforeAgentStartEvent,
  ContextWithSystemEvent,
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
import { buildSystemPrompt, createPromptEvent } from "./fixtures/prompt-event.js";

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

interface RegisteredHandlers {
  registrations: string[];
  handler: ((event: BeforeAgentStartEvent, ctx: ExtensionContext) => unknown) | undefined;
  contextHandler: ((event: ContextWithSystemEvent, ctx: ExtensionContext) => unknown) | undefined;
}

function registerHook(
  selected: string | undefined,
  styles: readonly StyleDefinition[] = [defaultStyle, conciseStyle],
): RegisteredHandlers {
  const registered: RegisteredHandlers = {
    registrations: [],
    handler: undefined,
    contextHandler: undefined,
  };
  const extensionApi = {
    on(event: string, registeredHandler: (event: never, ctx: ExtensionContext) => unknown) {
      registered.registrations.push(event);
      if (event === "before_agent_start") {
        registered.handler = registeredHandler as RegisteredHandlers["handler"];
      }
      if (event === "context_with_system") {
        registered.contextHandler = registeredHandler as RegisteredHandlers["contextHandler"];
      }
      return () => {};
    },
  } as unknown as ExtensionAPI;

  registerSystemPromptHook(
    extensionApi,
    {
      list: () => styles,
      resolve: (id) => styles.find((style) => style.id === id),
    },
    () => selected,
  );
  return registered;
}

function systemMessage(
  sections: Record<string, string | null> | undefined,
  extra: Record<string, unknown> = {},
): ContextWithSystemEvent["messages"][number] {
  return { role: "system", content: "", ...(sections === undefined ? {} : { sections }), timestamp: 0, ...extra } as
    ContextWithSystemEvent["messages"][number];
}

function contextEvent(messages: ContextWithSystemEvent["messages"]): ContextWithSystemEvent {
  return { type: "context_with_system", messages };
}

type ContextResult = { messages: ContextWithSystemEvent["messages"] } | undefined;

function sectionsOf(result: ContextResult, index: number): Record<string, string | null> | undefined {
  const message = result?.messages[index];
  return message?.role === "system" ? message.sections : undefined;
}

const conciseStyleSection = "## Output style: Concise\n\nPut the result first and keep the response compact.";
const previousStyleSection = "## Output style: default\n\nOld instructions";
const codingSection = `## Coding instructions\n\n${BASE_CODING_INSTRUCTIONS}`;
// The transcript stores what Pi rendered: every custom section wrapped in its own tag.
const rendered = (name: string, content: string): string => `<${name}>\n${content}\n</${name}>`;
const renderedStyle = rendered("pi_output_styles_style", conciseStyleSection);
const renderedCoding = rendered("pi_output_styles_coding", codingSection);
const conciseWithoutCoding: StyleDefinition = {
  ...conciseStyle,
  id: "concise-without-coding",
  keepCodingInstructions: false,
};

describe("registerSystemPromptHook", () => {
  it("registers the prompt hooks and preserves earlier extension text", async () => {
    const { registrations, handler } = registerHook("concise");

    expect(registrations).toEqual(["before_agent_start", "context_with_system"]);
    expect(handler).toBeDefined();

    const event = createPromptEvent("Native instructions\n\nEarlier extension instructions", {
      sections: { another_extension: "Preserve this section" },
    });
    const result = await handler?.(event, {} as ExtensionContext);

    expect(result).toBeUndefined();
    expect(event.systemPromptOptions.forceSystemPrompt).toBeUndefined();
    expect(event.systemPromptOptions.sections).toEqual({
      another_extension: "Preserve this section",
      pi_output_styles_coding: codingSection,
      pi_output_styles_style: conciseStyleSection,
    });
    expect(buildSystemPrompt(event.systemPromptOptions)).toContain(
      "Native instructions\n\nEarlier extension instructions",
    );
  });

  it("moves a changed style into the leading prompt and drops it from the later updates", async () => {
    const { handler, contextHandler } = registerHook("concise");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const head = systemMessage(
      {
        another_extension: "<another_extension>keep</another_extension>",
        pi_output_styles_coding: renderedCoding,
        pi_output_styles_style: rendered("pi_output_styles_style", previousStyleSection),
      },
      { toolsAdded: [{ name: "read" }] },
    );
    const lateStylePatch = systemMessage({
      pi_output_styles_style: rendered("pi_output_styles_style", previousStyleSection),
    });
    const lateOtherPatch = systemMessage({ another_extension: "<another_extension>updated</another_extension>" });
    const userMessage = { role: "user", content: "Hello", timestamp: 1 } as const;

    const result = (await contextHandler?.(
      contextEvent([head, lateStylePatch, lateOtherPatch, userMessage]),
      {} as ExtensionContext,
    )) as ContextResult;

    expect(result?.messages[0]).toMatchObject({
      role: "system",
      toolsAdded: [{ name: "read" }],
      sections: {
        another_extension: "<another_extension>keep</another_extension>",
        pi_output_styles_coding: renderedCoding,
        pi_output_styles_style: renderedStyle,
      },
    });
    expect(result?.messages[1]).toMatchObject({ role: "system", content: "" });
    expect(sectionsOf(result, 1)).toBeUndefined();
    expect(result?.messages[2]).toMatchObject({
      sections: { another_extension: "<another_extension>updated</another_extension>" },
    });
    expect(result?.messages[3]).toBe(userMessage);
    expect(sectionsOf({ messages: [head] }, 0)?.pi_output_styles_style).toBe(
      rendered("pi_output_styles_style", previousStyleSection),
    );
  });

  it("keeps the head content and its tool declarations while patching the sections", async () => {
    const { handler, contextHandler } = registerHook("concise");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const head = systemMessage({ pi_output_styles_style: rendered("pi_output_styles_style", previousStyleSection) }, {
      content: "Base prompt text",
      toolsAdded: [{ name: "read" }],
      toolsRemoved: [{ name: "bash" }],
      timestamp: 7,
    });

    const result = (await contextHandler?.(contextEvent([head]), {} as ExtensionContext)) as ContextResult;

    expect(result?.messages[0]).toMatchObject({
      content: "Base prompt text",
      timestamp: 7,
      toolsAdded: [{ name: "read" }],
      toolsRemoved: [{ name: "bash" }],
      sections: {
        pi_output_styles_coding: renderedCoding,
        pi_output_styles_style: renderedStyle,
      },
    });
  });

  it("leaves the request untouched while the leading prompt already matches the style", async () => {
    const { handler, contextHandler } = registerHook("concise");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const messages = [
      systemMessage({ pi_output_styles_coding: renderedCoding, pi_output_styles_style: renderedStyle }),
      { role: "user", content: "Hello", timestamp: 1 } as const,
    ];

    expect(await contextHandler?.(contextEvent(messages), {} as ExtensionContext)).toBeUndefined();
  });

  it("still drops a stale style update from the tail when the head already matches", async () => {
    const { handler, contextHandler } = registerHook("concise");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const messages = [
      systemMessage({ pi_output_styles_coding: renderedCoding, pi_output_styles_style: renderedStyle }),
      systemMessage({ pi_output_styles_style: rendered("pi_output_styles_style", previousStyleSection) }),
      { role: "user", content: "Hello", timestamp: 1 } as const,
    ];

    const result = (await contextHandler?.(contextEvent(messages), {} as ExtensionContext)) as ContextResult;

    expect(sectionsOf(result, 0)).toEqual({
      pi_output_styles_coding: renderedCoding,
      pi_output_styles_style: renderedStyle,
    });
    expect(sectionsOf(result, 1)).toBeUndefined();
  });

  it("removes the owned sections from the leading prompt when the style is default", async () => {
    const { handler, contextHandler } = registerHook("default");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const result = (await contextHandler?.(
      contextEvent([
        systemMessage({
          another_extension: "<another_extension>keep</another_extension>",
          pi_output_styles_coding: renderedCoding,
          pi_output_styles_style: renderedStyle,
        }),
      ]),
      {} as ExtensionContext,
    )) as ContextResult;

    expect(sectionsOf(result, 0)).toEqual({
      another_extension: "<another_extension>keep</another_extension>",
    });
  });

  it("removes only the coding section when the style omits the coding block", async () => {
    const { handler, contextHandler } = registerHook("concise-without-coding", [
      defaultStyle,
      conciseWithoutCoding,
    ]);
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const result = (await contextHandler?.(
      contextEvent([systemMessage({ pi_output_styles_coding: renderedCoding, pi_output_styles_style: renderedStyle })]),
      {} as ExtensionContext,
    )) as ContextResult;

    expect(sectionsOf(result, 0)).toEqual({ pi_output_styles_style: renderedStyle });
  });

  it("produces the same request twice for the same state", async () => {
    const { handler, contextHandler } = registerHook("concise");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const messages = [
      systemMessage({ pi_output_styles_style: rendered("pi_output_styles_style", previousStyleSection) }),
      { role: "user", content: "Hello", timestamp: 1 } as const,
    ];

    const first = (await contextHandler?.(contextEvent(messages), {} as ExtensionContext)) as { messages: ContextWithSystemEvent["messages"] };
    const sameInput = (await contextHandler?.(contextEvent(messages), {} as ExtensionContext)) as {
      messages: ContextWithSystemEvent["messages"];
    };
    const secondPass = await contextHandler?.(contextEvent(first.messages), {} as ExtensionContext);

    expect(JSON.stringify(sameInput.messages)).toBe(JSON.stringify(first.messages));
    expect(secondPass).toBeUndefined();
  });

  it("drops an empty section map instead of leaving an empty object on the head", async () => {
    const { handler, contextHandler } = registerHook("default");
    await handler?.(createPromptEvent("Native instructions"), {} as ExtensionContext);

    const result = (await contextHandler?.(
      contextEvent([systemMessage({ pi_output_styles_style: renderedStyle })]),
      {} as ExtensionContext,
    )) as ContextResult;

    expect(sectionsOf(result, 0)).toBeUndefined();
  });
});
