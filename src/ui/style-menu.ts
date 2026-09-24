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
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { stripControlSequences } from "../text-safety.js";
import type { StyleDefinition, StyleRegistry } from "../styles/types.js";

/** Below this render width the detail panel collapses and descriptions move into the rows. */
export const DETAIL_PANEL_MIN_WIDTH = 80;

const ZONE_GAP = 2;
const MIN_LIST_WIDTH = 18;
const MAX_LIST_RATIO = 0.6;
/** The fixed two-glyph cursor/active prefix plus its trailing space. */
const ROW_PREFIX_WIDTH = 4;
const HEADER_TEXT = "Select an output style";
const CHROME_ROWS = 4; // header, two borders and the footer
const CHROME_ROWS_FORCED = 5; // plus the forced banner
const BASE_KEYS = "↑↓ · Enter · Esc";

export type StyleMenuColor = "accent" | "border" | "dim" | "muted" | "text" | "warning";

/** Widest row text this registry renders, prefix included and origin only for custom styles. */
function widestRowText(registry: StyleRegistry): number {
  return registry.list().reduce((max, style) => {
    const origin = style.source === "builtin" ? "" : ` ${style.source}`;
    return Math.max(max, ROW_PREFIX_WIDTH + visibleWidth(style.name) + visibleWidth(origin));
  }, 0);
}

/** Widest wrapper the theme puts around a row (accent for the cursor, muted while forced). */
function themeWrapperWidth(theme: StyleMenuTheme | undefined): number {
  if (!theme) {
    return 0;
  }
  return Math.max(visibleWidth(theme.fg("accent", "")), visibleWidth(theme.fg("muted", "")));
}

/**
 * List-zone width sized to the widest row as it renders, theme wrappers included, so the
 * detail keeps the columns instead of reserving a fixed share of the terminal. Bounded by a
 * floor and by 60% of the width.
 */
export function listZoneWidth(registry: StyleRegistry, width: number, theme?: StyleMenuTheme): number {
  const ceiling = Math.floor(width * MAX_LIST_RATIO);
  const widest = widestRowText(registry) + themeWrapperWidth(theme) + 2;
  return Math.min(Math.max(MIN_LIST_WIDTH, widest), ceiling);
}

/** First rendered column of the detail zone in the two-zone layout. */
export function detailZoneStart(registry: StyleRegistry, width: number, theme?: StyleMenuTheme): number {
  return listZoneWidth(registry, width, theme) + ZONE_GAP;
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

/** Display copy of a style: printable text only, so style content cannot drive the terminal. */
function sanitizeStyleForDisplay(style: StyleDefinition): StyleDefinition {
  return {
    ...style,
    name: stripControlSequences(style.name),
    description: stripControlSequences(style.description),
    instructions: stripControlSequences(style.instructions),
    ...(style.filePath === undefined ? {} : { filePath: stripControlSequences(style.filePath) }),
  };
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
  /** Description lines the collapsed layout can spare for the cursor row. */
  private collapsedDescriptionLines = 0;

  constructor(private readonly options: StyleMenuOptions) {
    // Style files are untrusted input: a repository can ship `.pi/output-styles/*.md` whose
    // escape sequences would otherwise reach the terminal through this menu, so the copy
    // used for painting is stripped of control sequences (the chosen id is unaffected).
    this.styles = options.registry.list().map(sanitizeStyleForDisplay);
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
      const banner = `Forced by ${force.pluginId} — selection overridden, Enter disabled`;
      box.addChild(new TruncatedText(this.options.theme.fg("warning", banner), 0, 0));
    }
    // The header names the dialog; the footer carries the keys and the active legend.
    box.addChild(new TruncatedText(this.options.theme.fg("text", HEADER_TEXT), 0, 0));
    // Fixed chrome: the header, two borders, the optional banner and the footer. The two
    // zones split whatever the height budget leaves, so the total never exceeds it.
    const rowsBudget = Math.max(0, maxHeight - (force ? CHROME_ROWS_FORCED : CHROME_ROWS));
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
      return this.buildCollapsedZone(width, rowsBudget);
    }
    const detailStart = detailZoneStart(this.options.registry, width, this.options.theme);
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

  /**
   * Collapsed mode keeps the cursor row's description inside the list zone and reserves the
   * status line at the bottom while the budget can hold it, so the behaviour flags that make
   * the styles different do not vanish on narrow terminals. There is no body here.
   */
  private buildCollapsedZone(width: number, rowsBudget: number): Component {
    this.bodyScroll.updateLayout(0, 0, this.onBodyScroll);
    const statusWrapped = wrapTextWithAnsi(
      this.options.theme.fg("dim", this.statusText(this.styles[this.selectedIndex])),
      width,
    );
    const keepsStatus = rowsBudget - statusWrapped.length >= 1;
    const listBudget = keepsStatus ? rowsBudget - statusWrapped.length : rowsBudget;
    const components = this.rowComponents(this.collapsedRowWindow(width, listBudget), width);
    if (keepsStatus) {
      components.push(new Text(statusWrapped.join("\n"), 0, 0));
    }
    return new VStack(components);
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
  // silently dropping the right panel; the caller reserves the status line first and the
  // window grows around the cursor row until the remaining budget runs out.
  private collapsedRowWindow(width: number, rowsBudget: number): number[] {
    // The cursor row's description shares the list budget with the rows themselves; it is
    // trimmed (never dropped whole) when the budget cannot hold it, so the collapsed block
    // never renders more rows than it is given.
    const activeDescription = wrapTextWithAnsi(
      `  ${this.styles[this.selectedIndex].description}`,
      width,
    );
    this.collapsedDescriptionLines = Math.min(activeDescription.length, Math.max(0, rowsBudget - 1));
    const heights = this.styles.map((style, index) =>
      index === this.selectedIndex ? 1 + this.collapsedDescriptionLines : 1,
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
      if (collapsed && index === this.selectedIndex && this.collapsedDescriptionLines > 0) {
        const description = wrapTextWithAnsi(`  ${this.styles[index].description}`, width);
        components.push(new Text(description.slice(0, this.collapsedDescriptionLines).join("\n"), 0, 0));
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
    const keys = collapsed ? BASE_KEYS : `${BASE_KEYS} · PgUp/PgDn · Home/End scroll the body`;
    return `${keys} · * active`;
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
    // Two fixed glyph columns: the cursor is the row the keys act on, the star is the
    // persisted style. Neither relies on colour, so both survive monochrome terminals
    // and the muted rows of a forced style.
    const cursor = index === this.selectedIndex ? ">" : " ";
    const active = style.id === this.options.activeStyleId ? "*" : " ";
    const origin = style.source === "builtin" ? "" : ` ${style.source}`;
    const row = `${cursor} ${active} ${style.name}${origin}`;
    if (this.options.getForce?.()) {
      return this.options.theme.fg("muted", row);
    }
    return index === this.selectedIndex ? this.options.theme.fg("accent", row) : row;
  }
}
