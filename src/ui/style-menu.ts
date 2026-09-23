import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Box,
  HStack,
  Key,
  MouseRegion,
  ScrollView,
  Text,
  TruncatedText,
  VStack,
  matchesKey,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import type { StyleDefinition, StyleRegistry } from "../styles/types.js";

/** Below this render width the detail panel collapses and descriptions move into the rows. */
export const DETAIL_PANEL_MIN_WIDTH = 80;

const ZONE_GAP = 2;
const LIST_ZONE_RATIO = 0.4;
const BASE_KEYS = "↑↓ · Enter · Esc";

export type StyleMenuColor = "accent" | "border" | "dim" | "muted" | "text" | "warning";

/** First rendered column of the detail zone in the two-zone layout. */
export function detailZoneStart(width: number): number {
  return Math.ceil(width * LIST_ZONE_RATIO) + ZONE_GAP;
}

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
  /**
   * Live row budget for the whole menu (overlay maxHeight): borders, banner, list,
   * detail and footer always add up to at most this many lines, so the status line
   * can never render past the rows the overlay paints.
   */
  maxHeight: () => number;
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
  private cachedMaxHeight: number | undefined;
  private cachedLines: string[] | undefined;
  /**
   * Scroll state of the detail body. Pi composites overlays with a plain
   * component render (no internal layout pass), so the visible window is drawn
   * here from the ScrollView's scrollTop while this component owns the height.
   */
  private readonly bodyScroll = new ScrollView(new Text("", 0, 0));
  private bodyViewportLines = 0;
  private readonly onBodyScroll = (): void => {
    this.invalidate();
    this.options.requestRender();
  };
  /** Wheel entry point: MouseRegion gives the whole menu a wheel consumer without changing its render. */
  private readonly mouseRegion: MouseRegion;

  constructor(private readonly options: StyleMenuOptions) {
    this.styles = options.registry.list();
    const activeIndex = this.styles.findIndex((style) => style.id === options.activeStyleId);
    this.selectedIndex = activeIndex === -1 ? 0 : activeIndex;
    this.mouseRegion = new MouseRegion(
      { render: (width: number) => this.renderBox(width), invalidate: () => undefined },
      (event) => this.handleWheel(event),
    );
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedMaxHeight = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      if (this.selectedIndex > 0) {
        this.selectedIndex -= 1;
        // Each detail shows a different body; start reading the new one from the top.
        this.bodyScroll.scrollToStart();
      }
    } else if (matchesKey(data, Key.down)) {
      if (this.selectedIndex < this.styles.length - 1) {
        this.selectedIndex += 1;
        this.bodyScroll.scrollToStart();
      }
    } else if (matchesKey(data, Key.enter)) {
      // Selection stays disabled while a plugin forces a style: the banner explains
      // the override and Enter is inert until the force is released.
      if (this.options.getForce?.()) {
        return;
      }
      const style = this.styles[this.selectedIndex];
      this.options.done(style.id);
    } else if (matchesKey(data, Key.pageUp)) {
      this.scrollBodyBy(-this.bodyViewportLines);
    } else if (matchesKey(data, Key.pageDown)) {
      this.scrollBodyBy(this.bodyViewportLines);
    } else if (matchesKey(data, Key.home)) {
      this.bodyScroll.scrollToStart();
    } else if (matchesKey(data, Key.end)) {
      this.bodyScroll.scrollToEnd();
    } else if (matchesKey(data, Key.escape)) {
      this.options.done(null);
    } else {
      return;
    }
    this.invalidate();
    this.options.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    return this.mouseRegion.handleMouse(event);
  }

  render(width: number): string[] {
    return this.mouseRegion.render(width);
  }

  private renderBox(width: number): string[] {
    const maxHeight = this.options.maxHeight();
    if (this.cachedLines && this.cachedWidth === width && this.cachedMaxHeight === maxHeight) {
      return this.cachedLines;
    }
    const collapsed = width < DETAIL_PANEL_MIN_WIDTH;
    const force = this.options.getForce?.();
    const box = new Box(0, 0);
    box.addChild(new DynamicBorder((text: string) => this.options.theme.fg("border", text)));
    if (force) {
      const banner = `Forced by ${force.pluginId} — selection overridden`;
      box.addChild(new TruncatedText(this.options.theme.fg("warning", banner), 0, 0));
    }
    // Fixed chrome: two borders, the optional banner and the footer. The two zones
    // split whatever the height budget leaves, so the total never exceeds it.
    const rowsBudget = Math.max(0, maxHeight - (force ? 4 : 3));
    box.addChild(this.buildZones(width, rowsBudget));
    box.addChild(new TruncatedText(this.options.theme.fg("dim", this.footerText(collapsed)), 0, 0));
    box.addChild(new DynamicBorder((text: string) => this.options.theme.fg("border", text)));
    this.cachedLines = box.render(width);
    this.cachedWidth = width;
    this.cachedMaxHeight = maxHeight;
    return this.cachedLines;
  }

  private buildZones(width: number, rowsBudget: number): Component {
    const collapsed = width < DETAIL_PANEL_MIN_WIDTH;
    if (collapsed) {
      // No body on screen (status line and body have no room here): mirror that in the scroll state.
      this.bodyScroll.updateLayout(0, 0, this.onBodyScroll);
      return new VStack(this.rowComponents(this.collapsedRowWindow(width, rowsBudget), width));
    }
    const detailStart = detailZoneStart(width);
    const listWidth = detailStart - ZONE_GAP;
    const detailWidth = width - detailStart;
    const style = this.styles[this.selectedIndex];
    const statusLine = this.options.theme.fg("dim", this.statusText(style));
    const statusLines = wrapTextWithAnsi(statusLine, detailWidth).length;
    const description = wrapTextWithAnsi(style.description, detailWidth);
    const descriptionLines = Math.min(description.length, Math.max(1, rowsBudget - statusLines));
    this.bodyViewportLines = Math.max(0, rowsBudget - descriptionLines - statusLines);
    const detail = new VStack([
      new Text(description.slice(0, descriptionLines).join("\n"), 0, 0),
      ...this.bodyComponents(style, detailWidth),
      new Text(statusLine, 0, 0),
    ]);
    return new HStack(
      [
        {
          component: new VStack(this.rowComponents(this.expandedRowWindow(rowsBudget), width)),
          basis: listWidth,
        },
        { component: detail, basis: detailWidth },
      ],
      { gap: ZONE_GAP },
    );
  }

  private bodyComponents(style: StyleDefinition, detailWidth: number): Component[] {
    const wrapped = wrapTextWithAnsi(style.instructions, detailWidth);
    this.bodyScroll.updateLayout(wrapped.length, this.bodyViewportLines, this.onBodyScroll);
    if (this.bodyViewportLines === 0) {
      return [];
    }
    const start = this.bodyScroll.scrollTop;
    const windowLines = wrapped.slice(start, start + this.bodyViewportLines);
    if (windowLines.length === 0) {
      return [];
    }
    return [new Text(windowLines.join("\n"), 0, 0)];
  }

  /** Rows shown in the two-zone layout: a window of rowsBudget lines centred on the cursor. */
  private expandedRowWindow(rowsBudget: number): number[] {
    const budget = Math.min(Math.max(0, rowsBudget), this.styles.length);
    const start = Math.min(
      Math.max(0, this.selectedIndex - Math.floor(budget / 2)),
      this.styles.length - budget,
    );
    const rows: number[] = [];
    for (let index = start; index < start + budget; index += 1) {
      rows.push(index);
    }
    return rows;
  }

  // Collapsed mode keeps the cursor row's description inside the list zone instead of
  // silently dropping the right panel; the status line has no room and is omitted.
  // The window grows around the cursor row until the budget runs out.
  private collapsedRowWindow(width: number, rowsBudget: number): number[] {
    const heights = this.styles.map((style, index) =>
      index === this.selectedIndex
        ? 1 + wrapTextWithAnsi(`  ${style.description}`, width).length
        : 1,
    );
    let start = this.selectedIndex;
    let end = this.selectedIndex;
    let total = heights[start];
    while (end + 1 < heights.length && total + heights[end + 1] <= rowsBudget) {
      end += 1;
      total += heights[end];
    }
    while (start > 0 && total + heights[start - 1] <= rowsBudget) {
      start -= 1;
      total += heights[start];
    }
    const rows: number[] = [];
    for (let index = start; index <= end; index += 1) {
      rows.push(index);
    }
    return rows;
  }

  private rowComponents(indices: number[], width: number): Component[] {
    const collapsed = width < DETAIL_PANEL_MIN_WIDTH;
    return indices.flatMap((index) => {
      const components: Component[] = [new TruncatedText(this.rowText(index), 0, 0)];
      if (collapsed && index === this.selectedIndex) {
        components.push(new Text(`  ${this.styles[index].description}`, 0, 0));
      }
      return components;
    });
  }

  private handleWheel(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "wheel" || !event.wheelDelta) {
      return undefined;
    }
    // The menu owns the wheel while open; a body that fits simply absorbs the event.
    this.scrollBodyBy(event.wheelDelta);
    return { handled: true };
  }

  private scrollBodyBy(lines: number): void {
    if (lines === 0 || this.bodyViewportLines === 0) {
      return;
    }
    this.bodyScroll.scrollBy(lines);
  }

  /** Scroll keys mirror Pi's defaults: pageUp/pageDown for dialogs, home/end for the viewport. */
  private footerText(collapsed: boolean): string {
    return collapsed ? BASE_KEYS : `${BASE_KEYS} · PgUp/PgDn · Home/End scroll the body`;
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

  private rowText(index: number): string {
    const style = this.styles[index];
    const marker = style.id === this.options.activeStyleId ? "*" : " ";
    const origin = style.source === "builtin" ? "built-in" : style.source;
    const row = `${marker} ${style.name} ${origin}`;
    if (this.options.getForce?.()) {
      return this.options.theme.fg("muted", row);
    }
    return index === this.selectedIndex ? this.options.theme.fg("accent", row) : row;
  }
}
