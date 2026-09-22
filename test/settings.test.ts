import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSelectionStore } from "../src/settings.js";
import { createBuiltinRegistry, resolveActiveStyle } from "../src/styles/registry.js";

const execFile = promisify(execFileCallback);
const temporaryDirectories: string[] = [];

async function createAgentDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-output-styles-settings-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("selection persistence", () => {
  it("reads an absent selection as undefined and persists it across store instances", async () => {
    const agentDirectory = await createAgentDirectory();
    const firstStore = createSelectionStore(agentDirectory, { validStyleIds: ["default", "concise"] });

    await expect(firstStore.read()).resolves.toBeUndefined();
    await firstStore.write("concise");

    const secondStore = createSelectionStore(agentDirectory, { validStyleIds: ["default", "concise"] });

    await expect(secondStore.read()).resolves.toBe("concise");
  });

  it("writes the extension-owned JSON file without touching style discovery files", async () => {
    const agentDirectory = await createAgentDirectory();
    const stylesDirectory = join(agentDirectory, "output-styles");
    await mkdir(stylesDirectory, { recursive: true });
    await writeFile(join(stylesDirectory, "custom.md"), "---\nname: Custom\n---\n");

    await createSelectionStore(agentDirectory, { validStyleIds: ["concise"] }).write("concise");

    await expect(readFile(join(stylesDirectory, "custom.md"), "utf8")).resolves.toContain("Custom");
    await expect(readFile(join(agentDirectory, "pi-output-styles.selection.json"), "utf8")).resolves.toContain("concise");
  });

  it("falls back to undefined and reports invalid JSON without throwing", async () => {
    const agentDirectory = await createAgentDirectory();
    await writeFile(join(agentDirectory, "pi-output-styles.selection.json"), "{not-json");
    const errors: Error[] = [];
    const store = createSelectionStore(agentDirectory, {
      validStyleIds: ["default", "concise"],
      onError: (error) => errors.push(error),
    });

    const selectedId = await store.read();
    expect(selectedId).toBeUndefined();
    expect(resolveActiveStyle(createBuiltinRegistry(), selectedId).id).toBe("default");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/selection|JSON|parse/i);
  });

  it("falls back to undefined and reports an unreadable selection file", async () => {
    const agentDirectory = await createAgentDirectory();
    await mkdir(join(agentDirectory, "pi-output-styles.selection.json"));
    const errors: Error[] = [];
    const store = createSelectionStore(agentDirectory, { onError: (error) => errors.push(error) });

    await expect(store.read()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/selection|read/i);
  });

  it("serializes consecutive writes and keeps the last selection intact", async () => {
    const agentDirectory = await createAgentDirectory();
    const firstStore = createSelectionStore(agentDirectory, { validStyleIds: ["concise", "learning"] });
    const secondStore = createSelectionStore(agentDirectory, { validStyleIds: ["concise", "learning"] });

    await Promise.all([firstStore.write("concise"), secondStore.write("learning")]);

    const newStore = createSelectionStore(agentDirectory, { validStyleIds: ["concise", "learning"] });
    await expect(newStore.read()).resolves.toBe("learning");
    await expect(readFile(join(agentDirectory, "pi-output-styles.selection.json"), "utf8")).resolves.toMatch(/"selectedStyle": "learning"/);
  });

  it("rejects an unknown persisted identifier with a visible error", async () => {
    const agentDirectory = await createAgentDirectory();
    await writeFile(
      join(agentDirectory, "pi-output-styles.selection.json"),
      JSON.stringify({ selectedStyle: "removed-style" }),
    );
    const errors: Error[] = [];
    const store = createSelectionStore(agentDirectory, {
      onError: (error) => errors.push(error),
    });

    const selectedId = await store.read();
    expect(selectedId).toBeUndefined();
    expect(resolveActiveStyle(createBuiltinRegistry(), selectedId).id).toBe("default");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/unknown|style/i);
  });

  it("waits for a selection lock held by another process", async () => {
    const agentDirectory = await createAgentDirectory();
    const lockDirectory = join(agentDirectory, "pi-output-styles.selection.json.lock");
    await mkdir(lockDirectory);
    const scriptPath = join(agentDirectory, "write-selection.ts");
    const settingsModule = pathToFileURL(join(process.cwd(), "src/settings.ts")).href;
    await writeFile(
      scriptPath,
      `import { createSelectionStore } from ${JSON.stringify(settingsModule)};\n` +
        `await createSelectionStore(process.argv[2], { validStyleIds: ["concise"] }).write(process.argv[3]);\n`,
    );

    const child = execFile(process.execPath, [
      join(process.cwd(), "node_modules/vite-node/vite-node.mjs"),
      "--script",
      scriptPath,
      agentDirectory,
      "concise",
    ], { cwd: process.cwd() });
    let completed = false;
    void child.then(() => {
      completed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(completed).toBe(false);
    await rm(lockDirectory, { recursive: true, force: true });
    await expect(child).resolves.toBeDefined();
    expect(completed).toBe(true);
  });
});
