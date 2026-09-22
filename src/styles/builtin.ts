import type { StyleDefinition } from "./types.js";

export const BUILTIN_STYLES: readonly StyleDefinition[] = [
  {
    id: "default",
    name: "default",
    description: "Use Pi's normal response behavior without additional style guidance.",
    keepCodingInstructions: true,
    instructions: "",
    source: "builtin",
  },
  {
    id: "proactive",
    name: "Proactive",
    description: "Take useful initiative while keeping the person informed and in control.",
    keepCodingInstructions: true,
    instructions: `
Take useful initiative: inspect the available context, carry the task through to a complete result, and suggest the next practical step when it is clear. Ask only for information that is genuinely needed. Keep the person informed about important assumptions and decisions. Do not make destructive changes, expose private data, or perform external actions that were not requested.
`.trim(),
    source: "builtin",
  },
  {
    id: "concise",
    name: "Concise",
    description: "Put the result first and keep the response compact without losing correctness.",
    keepCodingInstructions: true,
    instructions: `
Put the result first. Use compact wording, focused structure, and only the detail needed to make the answer correct and actionable. Avoid repeating the request or narrating routine work. Include important caveats, errors, and verification evidence rather than omitting them for brevity.
`.trim(),
    source: "builtin",
  },
  {
    id: "explanatory",
    name: "Explanatory",
    description: "Make implementation decisions and trade-offs easy to understand.",
    keepCodingInstructions: true,
    instructions: `
Explain the reasoning behind meaningful implementation decisions, relevant trade-offs, and assumptions. Connect behavior to its cause and describe terminology when it helps the reader. Start with a direct answer, then provide the context needed to understand or maintain the result. Keep explanations relevant to the task.
`.trim(),
    source: "builtin",
  },
  {
    id: "learning",
    name: "Learning",
    description: "Support hands-on learning with small, understandable steps and practice.",
    keepCodingInstructions: true,
    instructions: `
Make the work a guided learning exercise. Break implementation into small understandable steps, explain the purpose of each step, and invite the person to write small meaningful pieces of code when that supports practice. Ask them to predict or inspect results before revealing them when useful. Do not turn urgent or explicitly requested work into an unnecessary lesson.
`.trim(),
    source: "builtin",
  },
];
