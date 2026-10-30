import type { BeforeAgentStartEvent, BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import {
  buildSystemPrompt,
  normalizeBuildSystemPromptOptions,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";

export { buildSystemPrompt };

export function createPromptEvent(
  systemPrompt: string,
  options: Partial<BuildSystemPromptOptions> = {},
): BeforeAgentStartEvent {
  const systemPromptOptions = normalizeBuildSystemPromptOptions({
    cwd: process.cwd(), customPrompt: systemPrompt, ...options,
  });
  return {
    type: "before_agent_start",
    prompt: "Synthetic request",
    get systemPrompt() { return buildSystemPrompt(systemPromptOptions); },
    systemPromptOptions,
  };
}
