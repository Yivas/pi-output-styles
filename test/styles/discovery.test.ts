import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverStyleFiles, styleIdFromFilename } from "../../src/styles/discovery.js";

const fixturesDirectory = new URL("../fixtures/custom/", import.meta.url);
const temporaryDirectories: string[] = [];

async function createFixtureRoots(): Promise<{ homeDir: string; projectRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "pi-output-styles-discovery-"));
  temporaryDirectories.push(root);
  const homeDir = join(root, "home");
  const projectRoot = join(root, "project");
  const userStylesDirectory = join(homeDir, ".pi", "agent", "output-styles");
  const projectStylesDirectory = join(projectRoot, ".pi", "output-styles");
  await mkdir(userStylesDirectory, { recursive: true });
  await mkdir(projectStylesDirectory, { recursive: true });
  await writeFile(
    join(userStylesDirectory, "Concise.md"),
    await readFile(new URL("user/Concise.md", fixturesDirectory)),
  );
  await writeFile(
    join(projectStylesDirectory, "Project.md"),
    await readFile(new URL("project/Project.md", fixturesDirectory)),
  );
  return { homeDir, projectRoot };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("discoverStyleFiles", () => {
  it("discovers only direct markdown files in the user and project roots", async () => {
    const { homeDir, projectRoot } = await createFixtureRoots();
    const userStylesDirectory = join(homeDir, ".pi", "agent", "output-styles");
    const projectStylesDirectory = join(projectRoot, ".pi", "output-styles");
    await writeFile(join(userStylesDirectory, "Alpha.md"), "not parsed here");
    await writeFile(join(userStylesDirectory, "ignored.txt"), "not a style");
    await mkdir(join(userStylesDirectory, "nested"));
    await writeFile(join(userStylesDirectory, "nested", "Nested.md"), "not discovered");
    await writeFile(join(projectStylesDirectory, "Beta.md"), "not parsed here");

    const files = discoverStyleFiles(projectRoot, homeDir);

    expect(files).toEqual([
      { path: join(userStylesDirectory, "Alpha.md"), source: "user" },
      { path: join(userStylesDirectory, "Concise.md"), source: "user" },
      { path: join(projectStylesDirectory, "Beta.md"), source: "project" },
      { path: join(projectStylesDirectory, "Project.md"), source: "project" },
    ]);
    expect(files.some(({ path }) => path.includes("nested"))).toBe(false);
  });

  it("returns an empty list when either supported root is absent", () => {
    const files = discoverStyleFiles(
      join(tmpdir(), "pi-output-styles-missing-project"),
      join(tmpdir(), "pi-output-styles-missing-home"),
    );

    expect(files).toEqual([]);
  });
});

describe("styleIdFromFilename", () => {
  it("normalizes the filename stem without reading the file", () => {
    expect(styleIdFromFilename("/styles/Response Style.md")).toBe("response-style");
    expect(styleIdFromFilename(basename("Concise.md"))).toBe("concise");
  });
});
