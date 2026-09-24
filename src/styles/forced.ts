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
  private readonly listeners = new Set<() => void>();
  private notifying = false;
  private pendingNotification = false;

  constructor(
    private readonly registry: StyleRegistry,
    private readonly onWarning?: ForcedStyleWarningHandler,
  ) {}

  /** Subscribers run whenever the active force appears, changes or is released. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyChange(): void {
    if (this.notifying) {
      // A listener changed the state during a pass: run another pass instead of dropping the
      // notice, so every listener sees the final state.
      this.pendingNotification = true;
      return;
    }
    this.notifying = true;
    try {
      let passes = 0;
      do {
        this.pendingNotification = false;
        for (const listener of [...this.listeners]) {
          try {
            listener();
          } catch (error) {
            // A failing subscriber must never break force(), release() or resolve(): the
            // controller is public API and is shared with other extensions.
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`[pi-output-styles] style force subscriber failed: ${detail}`);
          }
        }
        passes += 1;
      } while (this.pendingNotification && passes < 10);
      if (this.pendingNotification) {
        console.error("[pi-output-styles] style force subscribers kept changing state; stopping after 10 passes");
      }
    } finally {
      this.notifying = false;
    }
  }

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
    this.notifyChange();

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
          this.notifyChange();
        }
      },
    };
  }

  activeForce(): { pluginId: string; styleId: string } | undefined {
    const firstForce = this.activeForces[0];
    return firstForce ? { ...firstForce } : undefined;
  }

  resolve(selectedId: string | undefined): string | undefined {
    let dropped = false;
    while (this.activeForces.length > 0) {
      const firstForce = this.activeForces[0];
      const style = this.registry.resolve(firstForce.styleId);
      if (style && (style.source === "builtin" || style.instructions.trim().length > 0)) {
        break;
      }
      this.activeForces.shift();
      dropped = true;
    }
    if (dropped) {
      this.notifyChange();
    }
    const firstForce = this.activeForces[0];
    return firstForce ? firstForce.styleId : selectedId;
  }
}

export function createForcedStyleController(
  registry: StyleRegistry,
  onWarning?: ForcedStyleWarningHandler,
): ForcedStyleController {
  return new ForcedStyleController(registry, onWarning);
}
