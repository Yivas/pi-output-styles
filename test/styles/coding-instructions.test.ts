import { describe, expect, it } from "vitest";
import { BASE_CODING_INSTRUCTIONS } from "../../src/styles/coding-instructions.js";

describe("base coding instructions", () => {
  it("exposes a stable, non-empty engineering block", () => {
    expect(BASE_CODING_INSTRUCTIONS).toBe(
      "Approach coding tasks with care. Read relevant code and tests before editing. Preserve existing contracts and project instructions. Prefer the smallest correct change. Validate external input at boundaries, handle failures explicitly, and avoid hiding errors. Keep names and control flow clear. Add focused tests for changed behavior and run the repository's checks. Report what changed, how it was verified, and any remaining limitations.",
    );
    expect(BASE_CODING_INSTRUCTIONS.length).toBeGreaterThan(0);
  });
});
