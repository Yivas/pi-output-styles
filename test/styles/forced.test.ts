import { describe, expect, it, vi } from "vitest";
import { ForcedStyleController } from "../../src/styles/forced.js";
import { createBuiltinRegistry } from "../../src/styles/registry.js";

describe("ForcedStyleController", () => {
  it("forces a valid style over the selected style and restores it on release", () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    const force = controller.force("plugin-a", "concise");

    expect(controller.resolve("default")).toBe("concise");

    force.release();

    expect(controller.resolve("default")).toBe("default");
  });

  it("keeps the first valid force when plugins request different styles", () => {
    const warning = vi.fn();
    const controller = new ForcedStyleController(createBuiltinRegistry(), warning);
    const first = controller.force("plugin-a", "concise");
    controller.force("plugin-b", "proactive");

    expect(controller.resolve("default")).toBe("concise");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "force-conflict" }));

    first.release();
    expect(controller.resolve("default")).toBe("proactive");
  });

  it("reports the active force without exposing the internal entry", () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    expect(controller.activeForce()).toBeUndefined();

    const force = controller.force("plugin-a", "concise");
    const active = controller.activeForce();
    expect(active).toEqual({ pluginId: "plugin-a", styleId: "concise" });

    if (active) {
      active.styleId = "proactive";
    }
    expect(controller.activeForce()).toEqual({ pluginId: "plugin-a", styleId: "concise" });

    force.release();
    expect(controller.activeForce()).toBeUndefined();
  });

  it("keeps the first active force when plugins request different styles", () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    const first = controller.force("plugin-a", "concise");
    controller.force("plugin-b", "proactive");

    expect(controller.activeForce()).toEqual({ pluginId: "plugin-a", styleId: "concise" });

    first.release();
    expect(controller.activeForce()).toEqual({ pluginId: "plugin-b", styleId: "proactive" });
  });

  it("reports an invalid force without hiding the normal selection", () => {
    const warning = vi.fn();
    const controller = new ForcedStyleController(createBuiltinRegistry(), warning);

    const force = controller.force("plugin-a", "missing-style");

    expect(controller.resolve("explanatory")).toBe("explanatory");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid-force", styleId: "missing-style" }));
    expect(() => force.release()).not.toThrow();
  });

  it("notifies subscribers when the active force appears or is released", () => {
    const controller = new ForcedStyleController(createBuiltinRegistry());
    const seen: (string | undefined)[] = [];
    const off = controller.onChange(() => seen.push(controller.activeForce()?.styleId));

    const force = controller.force("plugin-a", "concise");
    force.release();
    off();
    controller.force("plugin-b", "proactive");

    expect(seen).toEqual(["concise", undefined]);
  });
});
