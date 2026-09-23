import { describe, expect, it, vi } from "vitest";
import { paintStyleStatus, STATUS_INDICATOR_KEY } from "../../src/ui/status-indicator.js";
import type { StyleMenuTheme } from "../../src/ui/style-menu.js";

function fakeTheme(): StyleMenuTheme {
  return {
    fg: (color, text) => `[${color}]${text}[/]`,
  };
}

// The host mirrors the ExtensionUIContext surface the helper is allowed to touch;
// setFooter is present only to prove the indicator never replaces the global footer.
function createHost() {
  return {
    setStatus: vi.fn(),
    setFooter: vi.fn(),
  };
}

describe("paintStyleStatus", () => {
  it("paints the default style muted under the extension's own key", () => {
    const host = createHost();

    paintStyleStatus(host, fakeTheme(), { id: "default", name: "default" });

    expect(STATUS_INDICATOR_KEY).toBe("pi-output-styles");
    expect(host.setStatus).toHaveBeenCalledWith("pi-output-styles", "[muted]style: default[/]");
    expect(host.setFooter).not.toHaveBeenCalled();
  });

  it("paints an active style with the accent color", () => {
    const host = createHost();

    paintStyleStatus(host, fakeTheme(), { id: "concise", name: "Concise" });

    expect(host.setStatus).toHaveBeenCalledWith("pi-output-styles", "[accent]style: Concise[/]");
    expect(host.setFooter).not.toHaveBeenCalled();
  });

  it("clears the status bar when there is no style to show", () => {
    const host = createHost();

    paintStyleStatus(host, fakeTheme(), undefined);

    expect(host.setStatus).toHaveBeenCalledWith("pi-output-styles", undefined);
    expect(host.setFooter).not.toHaveBeenCalled();
  });
});
