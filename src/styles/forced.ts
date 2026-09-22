import type { StyleRegistry } from "./types.js";

export interface ForcedStyleWarning {
  code: "invalid-force" | "force-conflict";
  message: string;
  pluginId: string;
  styleId: string;
  firstPluginId?: string;
  firstStyleId?: string;
}

export type ForcedStyleWarningHandler = (warning: ForcedStyleWarning) => void;

export interface ForcedStyleHandle {
  release(): void;
}

interface ActiveForce {
  pluginId: string;
  styleId: string;
}

export class ForcedStyleController {
  private readonly activeForces: ActiveForce[] = [];

  constructor(
    private readonly registry: StyleRegistry,
    private readonly onWarning?: ForcedStyleWarningHandler,
  ) {}

  force(pluginId: string, styleId: string): ForcedStyleHandle {
    const style = this.registry.resolve(styleId);
    if (!style || (style.source !== "builtin" && style.instructions.trim().length === 0)) {
      this.onWarning?.({
        code: "invalid-force",
        message: `Plugin ${pluginId} requested unavailable output style ${styleId}`,
        pluginId,
        styleId,
      });
      return { release: () => undefined };
    }

    const entry: ActiveForce = { pluginId, styleId };
    const firstForce = this.activeForces[0];
    this.activeForces.push(entry);

    if (firstForce && firstForce.styleId !== styleId) {
      this.onWarning?.({
        code: "force-conflict",
        message: `Plugin ${pluginId} requested ${styleId}, but plugin ${firstForce.pluginId} already forces ${firstForce.styleId}; keeping the first force`,
        pluginId,
        styleId,
        firstPluginId: firstForce.pluginId,
        firstStyleId: firstForce.styleId,
      });
    }

    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        const index = this.activeForces.indexOf(entry);
        if (index !== -1) {
          this.activeForces.splice(index, 1);
        }
      },
    };
  }

  resolve(selectedId: string | undefined): string | undefined {
    while (this.activeForces.length > 0) {
      const firstForce = this.activeForces[0];
      const style = this.registry.resolve(firstForce.styleId);
      if (style && (style.source === "builtin" || style.instructions.trim().length > 0)) {
        return firstForce.styleId;
      }
      this.activeForces.shift();
    }
    return selectedId;
  }
}

export function createForcedStyleController(
  registry: StyleRegistry,
  onWarning?: ForcedStyleWarningHandler,
): ForcedStyleController {
  return new ForcedStyleController(registry, onWarning);
}
