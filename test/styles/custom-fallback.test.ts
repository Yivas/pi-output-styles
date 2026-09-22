import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCustomStyles } from "../../src/styles/custom-loader.js";
import { mergeStyleSources } from "../../src/styles/merge.js";
import { createBuiltinRegistry, resolveActiveStyle } from "../../src/styles/registry.js";

const temporaryDirectories: string[] = [];
const validStyle = "---\nname: Temporary Style\ndescription: A temporary style.\nkeep-coding-instructions: true\n---\nKeep responses focused.\n";

function customRegistry(path: string) {
  const loaded = loadCustomStyles([{ path, source: "user" }]);
  return mergeStyleSources(createBuiltinRegistry(), loaded.styles, []).registry;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("custom style fallback", () => {
  it("falls back to default and reports an unknown selection", () => {
    const warning = vi.fn();

    const style = resolveActiveStyle(createBuiltinRegistry(), "does-not-exist", warning);

    expect(style.id).toBe("default");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "unknown-style", styleId: "does-not-exist" }));
  });

  it("falls back when a persisted custom file disappears before the next session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-output-styles-fallback-missing-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "Temporary.md");
    await writeFile(path, validStyle);
    const selectedId = customRegistry(path).resolve("temporary")?.id;
    await rm(path);
    const warning = vi.fn();

    const style = resolveActiveStyle(customRegistry(path), selectedId, warning);

    expect(style.id).toBe("default");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "unknown-style", styleId: "temporary" }));
  });

  it("falls back when a previously selected custom file becomes invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-output-styles-fallback-invalid-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "Temporary.md");
    await writeFile(path, validStyle);
    const selectedId = customRegistry(path).resolve("temporary")?.id;
    await writeFile(path, "not a style");
    const warning = vi.fn();

    const style = resolveActiveStyle(customRegistry(path), selectedId, warning);

    expect(style.id).toBe("default");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "unknown-style", styleId: "temporary" }));
  });

  it("falls back when a custom style has an empty instruction body", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-output-styles-fallback-empty-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "Empty.md");
    await writeFile(path, "---\nname: Empty Style\ndescription: Empty.\nkeep-coding-instructions: true\n---\n");
    const warning = vi.fn();

    const style = resolveActiveStyle(customRegistry(path), "empty", warning);

    expect(style.id).toBe("default");
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: "unknown-style", styleId: "empty" }));
  });
});
