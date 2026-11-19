import type { ContextWithSystemEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveActiveStyle, type StyleResolutionWarningHandler } from "./styles/registry.js";
import { BASE_CODING_INSTRUCTIONS } from "./styles/coding-instructions.js";
import type { StyleDefinition, StyleRegistry } from "./styles/types.js";

// The section names this extension owns: one coding block and one style block.
const ownedSectionNames = ["pi_output_styles_coding", "pi_output_styles_style"] as const;
type OwnedSectionName = (typeof ownedSectionNames)[number];
type OwnedSections = Partial<Record<OwnedSectionName, string>>;
type TranscriptMessage = ContextWithSystemEvent["messages"][number];

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

/** The section bodies this style contributes, as `before_agent_start` expects them. */
export function stylePromptSections(style: StyleDefinition): OwnedSections {
  const sections: OwnedSections = {};
  if (style.keepCodingInstructions && BASE_CODING_INSTRUCTIONS.length > 0) {
    sections.pi_output_styles_coding = `## Coding instructions\n\n${BASE_CODING_INSTRUCTIONS}`;
  }
  if (style.instructions.length > 0) {
    sections.pi_output_styles_style = `## Output style: ${style.name}\n\n${style.instructions}`;
  }
  return sections;
}

/**
 * Pi wraps every custom section in its own tag, and the transcript records that rendered form.
 * A request-time patch has to write the same shape or it no longer matches what Pi would render.
 */
function renderOwnedSections(sections: OwnedSections): OwnedSections {
  const rendered: OwnedSections = {};
  for (const name of ownedSectionNames) {
    const content = sections[name];
    if (content !== undefined) {
      rendered[name] = `<${name}>\n${content}\n</${name}>`;
    }
  }
  return rendered;
}

function isOwnedSection(name: string): boolean {
  return (ownedSectionNames as readonly string[]).includes(name);
}

export function registerSystemPromptHook(
  pi: ExtensionAPI,
  registry: StyleRegistry,
  getSelected: () => string | undefined,
  onWarning?: StyleResolutionWarningHandler,
): void {
  // Resolved once per run and reused by the request-time hook below, so a resolution warning is
  // reported once per run and the request keeps the style that run selected.
  let runStyle: StyleDefinition | undefined;
  const resolveRunStyle = (): StyleDefinition => resolveActiveStyle(registry, getSelected(), onWarning);

  pi.on("before_agent_start", (event) => {
    const style = resolveRunStyle();
    runStyle = style;
    const { sections, forceSystemPrompt } = event.systemPromptOptions;
    if (forceSystemPrompt !== undefined) {
      return { systemPrompt: composeStylePrompt(event.systemPrompt, style, BASE_CODING_INSTRUCTIONS) };
    }

    const owned = stylePromptSections(style);
    for (const name of ownedSectionNames) {
      const content = owned[name];
      if (content === undefined) {
        delete sections[name];
      } else {
        sections[name] = content;
      }
    }
  });

  // Pi sends the transcript's first system message as the leading prompt and appends later section
  // changes as mid-conversation updates. Models that accept those updates keep the old style at the
  // head, where the model follows it, and read the change as a late note. Splice only the two owned
  // sections into the leading message for the request and drop them from the later updates, so the
  // active style is stated once, where the model reads its instructions. Tool declarations and the
  // sections of other extensions are left untouched.
  pi.on("context_with_system", (event) => {
    const head = event.messages[0];
    if (!head || head.role !== "system") {
      return undefined;
    }

    const desired = renderOwnedSections(stylePromptSections(runStyle ?? resolveRunStyle()));
    const current = head.sections ?? {};
    const headDiffers = ownedSectionNames.some((name) => (current[name] ?? undefined) !== desired[name]);

    let tailChanged = false;
    const tail = event.messages.slice(1).map((message) => {
      const stripped = withoutOwnedSections(message);
      if (stripped !== message) {
        tailChanged = true;
      }
      return stripped;
    });
    if (!headDiffers && !tailChanged) {
      return undefined;
    }

    if (!headDiffers) {
      return { messages: [head, ...tail] };
    }

    const sections: Record<string, string | null> = { ...current };
    for (const name of Object.keys(sections)) {
      if (isOwnedSection(name)) {
        delete sections[name];
      }
    }
    for (const name of ownedSectionNames) {
      const content = desired[name];
      if (content !== undefined) {
        sections[name] = content;
      }
    }

    const patched = { ...head };
    if (Object.keys(sections).length === 0) {
      delete patched.sections;
    } else {
      patched.sections = sections;
    }
    return { messages: [patched, ...tail] };
  });
}

/** Copy of a later system message without the sections this extension owns. */
function withoutOwnedSections(message: TranscriptMessage): TranscriptMessage {
  if (message.role !== "system" || message.sections === undefined) {
    return message;
  }

  const sections = { ...message.sections };
  let removedOwned = false;
  for (const name of Object.keys(sections)) {
    if (isOwnedSection(name)) {
      delete sections[name];
      removedOwned = true;
    }
  }
  if (!removedOwned) {
    return message;
  }

  const next = { ...message };
  if (Object.keys(sections).length === 0) {
    delete next.sections;
  } else {
    next.sections = sections;
  }
  return next;
}
