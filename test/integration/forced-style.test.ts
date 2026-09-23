import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSystemPromptHook } from "../../src/prompt.js";
import { ForcedStyleController } from "../../src/styles/forced.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";

type RegisteredHandler = (event: { systemPrompt: string }, context: unknown) => unknown;

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
    const normal = beforeAgentStart?.({ systemPrompt: "Native instructions" }, {});
    expect(normal).toEqual({ systemPrompt: "Native instructions" });

    const force = controller.force("plugin-a", "concise");
    const forced = beforeAgentStart?.({ systemPrompt: "Native instructions" }, {});
    expect(forced).toEqual({ systemPrompt: expect.stringContaining("## Output style: Concise") });

    force.release();
    const restored = beforeAgentStart?.({ systemPrompt: "Native instructions" }, {});
    expect(restored).toEqual({ systemPrompt: "Native instructions" });
    expect(warning).not.toHaveBeenCalled();
  });
});
