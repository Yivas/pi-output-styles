import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveActiveStyle } from "./styles/registry.js";
import type { StyleDefinition, StyleRegistry } from "./styles/types.js";

export function appendStyleInstructions(systemPrompt: string, style: StyleDefinition): string {
  if (style.instructions.length === 0) {
    return systemPrompt;
  }

  return `${systemPrompt}\n\n## Output style: ${style.name}\n\n${style.instructions}`;
}

export function registerSystemPromptHook(
  pi: ExtensionAPI,
  registry: StyleRegistry,
  getSelected: () => string | undefined,
): void {
  pi.on("before_agent_start", (event) => {
    const style = resolveActiveStyle(registry, getSelected());
    return { systemPrompt: appendStyleInstructions(event.systemPrompt, style) };
  });
}
