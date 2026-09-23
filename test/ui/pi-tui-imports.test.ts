import { describe, expect, it } from "vitest";
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
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

describe("@earendil-works/pi-tui imports", () => {
  it("exposes the layout components the style menu builds on", () => {
    for (const component of [Box, HStack, VStack, Text, TruncatedText, MouseRegion, ScrollView]) {
      expect(component).toBeDefined();
    }
  });

  it("exposes the width and keyboard utilities the style menu builds on", () => {
    for (const utility of [visibleWidth, truncateToWidth, wrapTextWithAnsi, sliceByColumn, matchesKey]) {
      expect(utility).toBeTypeOf("function");
    }
    expect(Key.up).toBe("up");
    expect(Key.down).toBe("down");
    expect(Key.enter).toBe("enter");
    expect(Key.escape).toBe("escape");
  });
});
