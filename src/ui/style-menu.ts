import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Box, HStack, Key, Text, TruncatedText, VStack, matchesKey } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { StyleDefinition, StyleRegistry } from "../styles/types.js";

/** Below this render width the detail panel collapses and descriptions move into the rows. */
export const DETAIL_PANEL_MIN_WIDTH = 80;

const ZONE_GAP = 2;
const LIST_ZONE_RATIO = 0.4;

export type StyleMenuColor = "accent" | "border" | "dim" | "muted" | "text" | "warning";

/** Structural subset of Pi's Theme used by the menu; the real theme is injected by the custom() callback. */
export interface StyleMenuTheme {
  fg(color: StyleMenuColor, text: string): string;
}

export interface StyleMenuForce {
  pluginId: string;
  styleId: string;
}

export interface StyleMenuOptions {
  registry: StyleRegistry;
  theme: StyleMenuTheme;
  /** Style whose row carries the `*` marker; the effective selection when the menu opens. */
  activeStyleId: string;
  /** Live force state (product's ForcedStyleController.activeForce); consulted on every render and key. */
  getForce?: () => StyleMenuForce | undefined;
  /** Enter delivers the chosen style id; Escape delivers null. */
  done: (styleId: string | null) => void;
  requestRender: () => void;
}

export class StyleMenu {
  private readonly styles: readonly StyleDefinition[];
  private selectedIndex: number;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(private readonly options: StyleMenuOptions) {
    this.styles = options.registry.list();
    const activeIndex = this.styles.findIndex((style) => style.id === options.activeStyleId);
    this.selectedIndex = activeIndex === -1 ? 0 : activeIndex;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      if (this.selectedIndex > 0) {
        this.selectedIndex -= 1;
      }
    } else if (matchesKey(data, Key.down)) {
      if (this.selectedIndex < this.styles.length - 1) {
        this.selectedIndex += 1;
      }
    } else if (matchesKey(data, Key.enter)) {
      // Selection stays disabled while a plugin forces a style: the banner explains
      // the override and Enter is inert until the force is released.
      if (this.options.getForce?.()) {
        return;
      }
      const style = this.styles[this.selectedIndex];
      this.options.done(style.id);
    } else if (matchesKey(data, Key.escape)) {
      this.options.done(null);
    } else {
      return;
    }
    this.invalidate();
    this.options.requestRender();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    const box = new Box(0, 0);
    box.addChild(new DynamicBorder((text: string) => this.options.theme.fg("border", text)));
    const force = this.options.getForce?.();
    if (force) {
      const banner = `Forced by ${force.pluginId} — selection overridden`;
      box.addChild(new TruncatedText(this.options.theme.fg("warning", banner), 0, 0));
    }
    box.addChild(this.buildZones(width));
    box.addChild(new DynamicBorder((text: string) => this.options.theme.fg("border", text)));
    this.cachedLines = box.render(width);
    this.cachedWidth = width;
    return this.cachedLines;
  }

  private buildZones(width: number): Component {
    const collapsed = width < DETAIL_PANEL_MIN_WIDTH;
    const rows = this.rowComponents(collapsed);
    if (collapsed) {
      return new VStack(rows);
    }
    const listWidth = Math.ceil(width * LIST_ZONE_RATIO);
    const detailWidth = width - listWidth - ZONE_GAP;
    const detail = new VStack(this.detailComponents());
    return new HStack(
      [
        { component: new VStack(rows), basis: listWidth },
        { component: detail, basis: detailWidth },
      ],
      { gap: ZONE_GAP },
    );
  }

  // Collapsed mode keeps the cursor row's description inside the list zone instead of
  // silently dropping the right panel; the status line has no room and is omitted.
  private rowComponents(includeDescription: boolean): Component[] {
    return this.rowTexts().flatMap((row, index) => {
      const components: Component[] = [new TruncatedText(row, 0, 0)];
      if (includeDescription && index === this.selectedIndex) {
        components.push(new Text(`  ${this.styles[index].description}`, 0, 0));
      }
      return components;
    });
  }

  private detailComponents(): Component[] {
    const style = this.styles[this.selectedIndex];
    return [
      new Text(style.description, 0, 0),
      new Text(this.options.theme.fg("dim", this.statusText(style)), 0, 0),
    ];
  }

  private statusText(style: StyleDefinition): string {
    const parts = [`turn reminder: ${style.turnReminder ? "yes" : "no"}`];
    if (style.waitingTurnReminder) {
      parts.push("waiting reminder: unavailable (Pi)");
    }
    parts.push(`keep-coding: ${style.keepCodingInstructions ? "on" : "off"}`);
    if (style.filePath) {
      parts.push(`from ${style.filePath}`);
    }
    return parts.join(" · ");
  }

  private rowTexts(): string[] {
    return this.styles.map((style, index) => {
      const marker = style.id === this.options.activeStyleId ? "*" : " ";
      const origin = style.source === "builtin" ? "built-in" : style.source;
      const row = `${marker} ${style.name} ${origin}`;
      if (this.options.getForce?.()) {
        return this.options.theme.fg("muted", row);
      }
      return index === this.selectedIndex ? this.options.theme.fg("accent", row) : row;
    });
  }
}
