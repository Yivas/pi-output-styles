import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { composeStylePrompt } from "../../src/prompt.js";
import { BASE_CODING_INSTRUCTIONS } from "../../src/styles/coding-instructions.js";
import { parseStyleFile } from "../../src/styles/parser.js";
import { createTransportCapture, type TransportPayload } from "../fixtures/transport-capture.js";

const executeFile = promisify(execFile);

describe("system prompt transport boundary", () => {
  it("preserves the serialized prefix when a session activates another tool", { timeout: 30_000 }, async () => {
    const { stdout } = await executeFile(process.execPath, ["test/fixtures/prompt-session-probe.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PI_PACKAGE_DIR: join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent") },
    });
    expect(JSON.parse(stdout)).toMatchObject({
      version: "0.87.0", prefixPreserved: true, styleOccurrences: 1, networkRequests: 0,
    });
  });

  it("preserves native instructions in the forced-prompt fallback with either coding setting", async () => {
    const fixturesDirectory = fileURLToPath(new URL("../fixtures/styles/", import.meta.url));
    const chainedPrompt = "native instructions\n\nproject instructions";

    for (const fixtureName of ["keep-coding-true.md", "keep-coding-false.md"] as const) {
      const style = parseStyleFile(await readFile(join(fixturesDirectory, fixtureName), "utf8"), fixtureName);
      const effectivePrompt = composeStylePrompt(chainedPrompt, style, BASE_CODING_INSTRUCTIONS);
      const transport = createTransportCapture();
      const payload: TransportPayload = {
        messages: [
          { role: "system", content: effectivePrompt },
          { role: "user", content: "Summarize the change" },
        ],
      };
      transport.observe(payload);
      const capturedSystemPrompt = transport.read().messages[0]?.content;
      expect(capturedSystemPrompt).toContain(chainedPrompt);
      expect(capturedSystemPrompt?.split(style.instructions).length).toBe(2);
      if (style.keepCodingInstructions) {
        expect(capturedSystemPrompt?.split(BASE_CODING_INSTRUCTIONS).length).toBe(2);
      } else {
        expect(capturedSystemPrompt).not.toContain(BASE_CODING_INSTRUCTIONS);
      }
    }
  });
});
