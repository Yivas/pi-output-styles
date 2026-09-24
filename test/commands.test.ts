import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerOutputStyleCommand, parseOutputStyleArgs } from "../src/commands.js";
import { registerSystemPromptHook } from "../src/prompt.js";
import { SelectionState } from "../src/state.js";
import type { SelectionStore } from "../src/settings.js";
import { createBuiltinRegistry } from "../src/styles/registry.js";
import { mergeStyleSources } from "../src/styles/merge.js";
import { ForcedStyleController } from "../src/styles/forced.js";
import type { StyleMenuTheme } from "../src/ui/style-menu.js";

const esc = String.fromCharCode(27);

describe("parseOutputStyleArgs", () => {
  it.each([
    ["", { action: "list" }],
    ["list", { action: "list" }],
    ["status", { action: "status" }],
    ["Concise", { action: "select", styleId: "concise" }],
  ])("parses %j", (args, expected) => {
    expect(parseOutputStyleArgs(args)).toEqual(expected);
  });

  it("keeps an unknown style as a selection for registry validation", () => {
    expect(parseOutputStyleArgs("missing-style")).toEqual({
      action: "select",
      styleId: "missing-style",
    });
  });
});

function registerCommand(
  selection?: SelectionStore,
  activeForce?: () => { pluginId: string; styleId: string } | undefined,
) {
  const registry = createBuiltinRegistry();
  const state = new SelectionState();
  let command: RegisteredCommand | undefined;
  const extensionApi = {
    registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
      command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
    }),
  } as unknown as ExtensionAPI;

  registerOutputStyleCommand(extensionApi, registry, state, selection, activeForce);

  return { command: command as RegisteredCommand, state };
}

describe("/output-style", () => {

  function context(hasUI: boolean, notify = vi.fn()): ExtensionCommandContext {
    if (!hasUI) {
      return { hasUI } as unknown as ExtensionCommandContext;
    }
    return { hasUI, ui: { notify } } as unknown as ExtensionCommandContext;
  }

  it("lists the built-ins and marks the active style without exposing prompt contents", async () => {
    const { command } = registerCommand();
    const notify = vi.fn();

    await command.handler("", context(true, notify));

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toContain("Active: default");
    expect(notify.mock.calls[0]?.[0]).toContain("Concise");
    const listing = notify.mock.calls[0]?.[0] as string;
    for (const style of createBuiltinRegistry().list()) {
      if (style.instructions) {
        expect(listing).not.toContain(style.instructions);
      }
    }
  });

  it("reports status and changes the active style for later turns", async () => {
    const { command, state } = registerCommand();
    const notify = vi.fn();
    const promptHandler = vi.fn();
    const promptApi = {
      on: (_event: string, handler: typeof promptHandler) => {
        promptHandler.mockImplementation(handler);
        return () => {};
      },
    } as unknown as ExtensionAPI;
    registerSystemPromptHook(promptApi, createBuiltinRegistry(), () => state.getSelected());

    await command.handler("status", context(true, notify));
    expect(notify).toHaveBeenLastCalledWith("Active output style: default", "info");

    await command.handler("Concise", context(true, notify));
    expect(state.getSelected()).toBe("concise");
    expect(notify).toHaveBeenLastCalledWith("Output style selected: Concise", "info");

    const result = await promptHandler(
      {
        type: "before_agent_start",
        prompt: "Continue",
        systemPrompt: "Native instructions",
        systemPromptOptions: {},
      } as BeforeAgentStartEvent,
      {} as never,
    );
    expect(result).toEqual({
      systemPrompt: expect.stringContaining("## Output style: Concise"),
    });
  });

  it("persists the selection even while a plugin forces another style", async () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    controller.force("plugin-a", "concise");
    const selection: SelectionStore = {
      read: vi.fn(async () => undefined),
      write: vi.fn(async () => {}),
    };
    const { command, state } = registerCommand(selection, () => controller.activeForce());
    const { context } = menuContext("tui");

    await command.handler("Proactive", context);

    expect(selection.write).toHaveBeenCalledWith("proactive");
    expect(state.getSelected()).toBe("proactive");
  });

  it("prefers the built-in id over a custom style showing the same name", async () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        {
          id: "my-concise",
          name: "Concise",
          description: "A custom style named like the built-in.",
          keepCodingInstructions: true,
          instructions: "Custom concise instructions.",
          source: "user" as const,
        },
      ],
      [],
    ).registry;
    const state = new SelectionState();
    let command: RegisteredCommand | undefined;
    const extensionApi = {
      registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
        command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
      }),
    } as unknown as ExtensionAPI;
    registerOutputStyleCommand(extensionApi, registry, state);
    const { context } = menuContext("tui");

    await command?.handler("Concise", context);

    expect(state.getSelected()).toBe("concise");
  });

  it("reports an ambiguous name with the candidate ids and how to disambiguate", async () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        {
          id: "team-a",
          name: "Team Voice",
          description: "First.",
          keepCodingInstructions: true,
          instructions: "First body.",
          source: "user" as const,
        },
        {
          id: "team-b",
          name: "Team voice",
          description: "Second.",
          keepCodingInstructions: true,
          instructions: "Second body.",
          source: "project" as const,
        },
      ],
      [],
    ).registry;
    const state = new SelectionState();
    let command: RegisteredCommand | undefined;
    const extensionApi = {
      registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
        command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
      }),
    } as unknown as ExtensionAPI;
    registerOutputStyleCommand(extensionApi, registry, state);
    const { context, notify } = menuContext("tui");

    await command?.handler("Team Voice", context);

    expect(state.getSelected()).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith(
      "Ambiguous output style: Team Voice — matches several styles: team-a, team-b (use the id)",
      "error",
    );
  });

  it("strips terminal sequences from the status message of a custom style", async () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        {
          id: "hostile",
          name: `Hostile${esc}[2JName`,
          description: "Hostile description.",
          keepCodingInstructions: true,
          instructions: "Hostile instructions.",
          source: "user" as const,
        },
      ],
      [],
    ).registry;
    const state = new SelectionState();
    state.setSelected("hostile");
    let command: RegisteredCommand | undefined;
    const extensionApi = {
      registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
        command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
      }),
    } as unknown as ExtensionAPI;
    registerOutputStyleCommand(extensionApi, registry, state);
    const { context, notify } = menuContext("tui");

    await command?.handler("status", context);

    const message = notify.mock.calls[0]?.[0] as string;
    expect(message).toBe("Active output style: HostileName");
  });

  it("reports an unknown style and leaves the active style unchanged", async () => {
    const { command, state } = registerCommand();
    const notify = vi.fn();

    await command.handler("unknown", context(true, notify));

    expect(state.getSelected()).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith("Unknown output style: unknown", "error");
  });

  it("changes state without requiring UI", async () => {
    const { command, state } = registerCommand();

    await expect(command.handler("Concise", context(false))).resolves.toBeUndefined();
    expect(state.getSelected()).toBe("concise");
  });
});

interface MenuComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

type MenuFactory = (
  tui: { requestRender: ReturnType<typeof vi.fn>; terminal: { rows: number } },
  theme: StyleMenuTheme,
  keybindings: unknown,
  done: (result: string | null) => void,
) => MenuComponent;

function fakeTheme(): StyleMenuTheme {
  return {
    fg: (color, text) => `[${color}]${text}[/]`,
  };
}

function menuContext(mode: string, custom: ReturnType<typeof vi.fn> = vi.fn()) {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const context = {
    mode,
    hasUI: true,
    ui: { notify, custom, setStatus, theme: fakeTheme() },
  } as unknown as ExtensionCommandContext;
  return { context, custom, notify, setStatus };
}

describe("/output-style menu guards", () => {
  it("opens the menu dialog in TUI mode without emitting the text listing", async () => {
    const { command } = registerCommand();
    const { context, custom, notify } = menuContext("tui");

    await command.handler("", context);

    expect(custom).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });

  it("opens the menu as a native dialog in the editor slot, without overlay and at natural height", async () => {
    const { command } = registerCommand();
    let renderedHeight = 0;
    const custom = vi.fn((factory: MenuFactory, options?: { overlay?: boolean }) => {
      // The real modal path runs the factory and mounts the component in the editor slot.
      const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, () => null);
      renderedHeight = component.render(120).length;
      return options;
    });
    const { context } = menuContext("tui", custom);

    await command.handler("", context);

    // No overlay options at all: the component goes to the same slot as Pi's own dialogs.
    expect(custom.mock.calls[0]?.[1]).toBeUndefined();
    // Natural dialog height: one row per style plus header, borders and footer, not the terminal height.
    expect(renderedHeight).toBe(createBuiltinRegistry().list().length + 4);
  });

  it("keeps every style row visible under a forced style within the natural budget", async () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    controller.force("plugin-a", "concise");
    const { command } = registerCommand(undefined, () => controller.activeForce());
    let rendered = "";
    const custom = vi.fn(async (factory: MenuFactory) => {
      const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, () => null);
      rendered = component.render(120).join("\n");
      return null;
    });
    const { context } = menuContext("tui", custom);

    await command.handler("", context);

    // Banner plus header plus every style row plus two borders and the footer: the +5 budget.
    expect(rendered.split("\n").length).toBe(createBuiltinRegistry().list().length + 5);
    expect(rendered).toContain("Forced by plugin-a");
  });

  it.each(["rpc", "print", "json"])("keeps the text listing in %s mode", async (mode) => {
    const { command } = registerCommand();
    const { context, custom, notify } = menuContext(mode);

    await command.handler("", context);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Available output styles"), "info");
    expect(custom).not.toHaveBeenCalled();
  });

  it("keeps the explicit list argument textual even in TUI mode", async () => {
    const { command } = registerCommand();
    const { context, custom, notify } = menuContext("tui");

    await command.handler("list", context);

    expect(custom).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Available output styles"), "info");
  });

  it("persists the menu choice on Enter, updates the state and paints the status bar", async () => {
    const selection: SelectionStore = {
      read: vi.fn(async () => undefined),
      write: vi.fn(async () => {}),
    };
    const { command, state } = registerCommand(selection);
    const custom = vi.fn(
      (factory: MenuFactory) =>
        new Promise<string | null>((resolve) => {
          const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, resolve);
          component.handleInput("\x1b[B");
          component.handleInput("\x1b[B");
          component.handleInput("\r");
        }),
    );
    const { context, notify, setStatus } = menuContext("tui", custom);

    await command.handler("", context);

    expect(selection.write).toHaveBeenCalledWith("concise");
    expect(state.getSelected()).toBe("concise");
    expect(setStatus).toHaveBeenCalledWith("pi-output-styles", "[accent]style: Concise[/]");
    expect(notify).toHaveBeenLastCalledWith("Output style selected: Concise", "info");
  });

  it("paints the style the plugin forces, not the one just selected", async () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    controller.force("plugin-a", "concise");
    const { command, state } = registerCommand(undefined, () => controller.activeForce());
    const { context, setStatus } = menuContext("tui");

    await command.handler("Proactive", context);

    expect(state.getSelected()).toBe("proactive");
    expect(setStatus).toHaveBeenLastCalledWith("pi-output-styles", "[accent]style: Concise[/]");
  });

  it("selects a custom style by the name the menu shows when it differs from the id", async () => {
    const registry = mergeStyleSources(
      createBuiltinRegistry(),
      [
        {
          id: "team",
          name: "Team Voice",
          description: "Team voice.",
          keepCodingInstructions: true,
          instructions: "Team instructions.",
          source: "user" as const,
        },
      ],
      [],
    ).registry;
    const state = new SelectionState();
    let command: RegisteredCommand | undefined;
    const extensionApi = {
      registerCommand: vi.fn((_name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
        command = { name: "output-style", sourceInfo: {} as RegisteredCommand["sourceInfo"], ...options };
      }),
    } as unknown as ExtensionAPI;
    registerOutputStyleCommand(extensionApi, registry, state);
    const { context, notify } = menuContext("tui");

    await command?.handler("Team Voice", context);

    expect(state.getSelected()).toBe("team");
    expect(notify).toHaveBeenLastCalledWith("Output style selected: Team Voice", "info");
  });

  it("closes the menu on Escape without changing selection, persistence or the status bar", async () => {
    const selection: SelectionStore = {
      read: vi.fn(async () => undefined),
      write: vi.fn(async () => {}),
    };
    const { command, state } = registerCommand(selection);
    const custom = vi.fn(
      (factory: MenuFactory) =>
        new Promise<string | null>((resolve) => {
          const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, resolve);
          component.handleInput("\x1b");
        }),
    );
    const { context, notify, setStatus } = menuContext("tui", custom);

    await command.handler("", context);

    expect(selection.write).not.toHaveBeenCalled();
    expect(state.getSelected()).toBeUndefined();
    expect(setStatus).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("paints the status bar after a direct selection in TUI mode", async () => {
    const { command, state } = registerCommand();
    const { context, custom, setStatus } = menuContext("tui");

    await command.handler("Concise", context);

    expect(state.getSelected()).toBe("concise");
    expect(setStatus).toHaveBeenCalledWith("pi-output-styles", "[accent]style: Concise[/]");
    expect(custom).not.toHaveBeenCalled();
  });

  it("marks default in the menu when the persisted selection is unknown", async () => {
    const { command, state } = registerCommand();
    state.setSelected("ghost");
    let rendered = "";
    const custom = vi.fn(async (factory: MenuFactory) => {
      const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, () => null);
      rendered = component.render(120).join("\n");
      return null;
    });
    const { context } = menuContext("tui", custom);

    await command.handler("", context);

    expect(rendered).toContain("> * default");
    expect(rendered).not.toContain("* Proactive");
  });

  it("feeds the live forced-style state of the product into the menu banner", async () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    controller.force("plugin-a", "concise");
    const { command } = registerCommand(undefined, () => controller.activeForce());
    let rendered = "";
    const custom = vi.fn(async (factory: MenuFactory) => {
      const component = factory({ requestRender: vi.fn(), terminal: { rows: 40 } }, fakeTheme(), {}, () => null);
      rendered = component.render(120).join("\n");
      return null;
    });
    const { context } = menuContext("tui", custom);

    await command.handler("", context);

    expect(rendered).toContain("Forced by plugin-a — selection overridden");
  });
});
