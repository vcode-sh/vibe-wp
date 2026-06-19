import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  test("parses boolean and value flags", () => {
    const options = parseArgs([
      "--dry-run",
      "--install-dir",
      "/srv/vibe-wp",
      "--repo",
      "https://example.com/vibe-wp.git",
      "--ref",
      "release",
      "--no-caddy"
    ]);

    expect(options.dryRun).toBe(true);
    expect(options.installDir).toBe("/srv/vibe-wp");
    expect(options.repo).toBe("https://example.com/vibe-wp.git");
    expect(options.ref).toBe("release");
    expect(options.noCaddy).toBe(true);
  });

  test("rejects missing values", () => {
    expect(() => parseArgs(["--repo"])).toThrow("--repo requires a value.");
  });
});
