import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  name: string;
  version: string;
  type: string;
  private?: boolean;
  pi?: { extensions?: string[] };
  files?: string[];
};

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

async function readManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(packagePath, "utf8")) as PackageManifest;
}

describe("package manifest", () => {
  it("declares the Pi extension entrypoint and an explicit public allowlist", async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe("pi-response-styles");
    expect(manifest.type).toBe("module");
    expect(manifest.pi?.extensions).toEqual(["./src/extension.ts"]);
    expect(manifest.files).toEqual([
      "src",
      "docs/compatibility.md",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
    ]);
    expect(manifest.files).not.toContain("test");
    expect(manifest.files).not.toContain("planning");
    expect(manifest.files).not.toContain("AGENTS.md");
  });
});
