import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveActiveStyle } from "./styles/registry.js";
import { BASE_CODING_INSTRUCTIONS } from "./styles/coding-instructions.js";
import type { StyleDefinition, StyleRegistry } from "./styles/types.js";

export function composeStylePrompt(
  systemPrompt: string,
  style: StyleDefinition,
  baseCodingInstructions: string,
): string {
  const blocks = [systemPrompt];

  if (style.keepCodingInstructions && baseCodingInstructions.length > 0) {
    blocks.push(`## Coding instructions\n\n${baseCodingInstructions}`);
  }
  if (style.instructions.length > 0) {
    blocks.push(`## Output style: ${style.name}\n\n${style.instructions}`);
  }

  return blocks.join("\n\n");
}

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
    return { systemPrompt: composeStylePrompt(event.systemPrompt, style, BASE_CODING_INSTRUCTIONS) };
  });
}
