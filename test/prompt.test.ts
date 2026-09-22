import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { appendStyleInstructions, registerSystemPromptHook } from "../src/prompt.js";
import type { StyleDefinition } from "../src/styles/types.js";

const defaultStyle: StyleDefinition = {
  id: "default",
  name: "default",
  description: "Normal response behavior.",
  keepCodingInstructions: true,
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
        "Native instructions\n\nEarlier extension instructions\n\n## Output style: Concise\n\nPut the result first and keep the response compact.",
    });
  });
});
