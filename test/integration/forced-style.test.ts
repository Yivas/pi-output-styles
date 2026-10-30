import { describe, expect, it, vi } from "vitest";
import type { BeforeAgentStartEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPromptEvent } from "../fixtures/prompt-event.js";
import { registerSystemPromptHook } from "../../src/prompt.js";
import { ForcedStyleController } from "../../src/styles/forced.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";

type RegisteredHandler = (event: BeforeAgentStartEvent, context: unknown) => unknown;

function createPromptApi() {
  let handler: RegisteredHandler | undefined;
  const api = {
    on(event: string, callback: RegisteredHandler) {
      if (event === "before_agent_start") {
        handler = callback;
      }
      return () => undefined;
    },
  } as unknown as ExtensionAPI;
  return { api, getPrompt: () => handler };
}

describe("forced style prompt integration", () => {
  it("applies the first force to the prompt and returns to the normal selection", () => {
    const registry = createBuiltinRegistry();
    const warning = vi.fn();
    const controller = new ForcedStyleController(registry, warning);
    const api = createPromptApi();
    const selectedId = "default";
    registerSystemPromptHook(api.api, registry, () => controller.resolve(selectedId));

    const beforeAgentStart = api.getPrompt();
    expect(beforeAgentStart).toBeDefined();
    const event = createPromptEvent("Native instructions");
    expect(beforeAgentStart?.(event, {})).toBeUndefined();
    expect(event.systemPromptOptions.sections).toEqual({});

    const force = controller.force("plugin-a", "concise");
    expect(beforeAgentStart?.(event, {})).toBeUndefined();
    expect(event.systemPromptOptions.sections.pi_output_styles_style).toContain("## Output style: Concise");

    force.release();
    expect(beforeAgentStart?.(event, {})).toBeUndefined();
    expect(event.systemPromptOptions.sections).toEqual({});
    expect(warning).not.toHaveBeenCalled();
  });
});
