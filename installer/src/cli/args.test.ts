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
      "--local",
      "--no-caddy"
    ]);

    expect(options.dryRun).toBe(true);
    expect(options.installDir).toBe("/srv/vibe-wp");
    expect(options.repo).toBe("https://example.com/vibe-wp.git");
    expect(options.ref).toBe("release");
    expect(options.local).toBe(true);
    expect(options.noCaddy).toBe(true);
  });

  test("rejects missing values", () => {
    expect(() => parseArgs(["--repo"])).toThrow("--repo requires a value.");
  });

  test("parses domain, admin email, and mode flags", () => {
    const options = parseArgs([
      "--domain",
      "x.com",
      "--admin-email",
      "a@b.com",
      "--mode",
      "staging-only"
    ]);

    expect(options.domain).toBe("x.com");
    expect(options.adminEmail).toBe("a@b.com");
    expect(options.mode).toBe("staging-only");
  });

  test("parses staging-domain flag", () => {
    const options = parseArgs(["--staging-domain", "stage.x.com"]);
    expect(options.stagingDomain).toBe("stage.x.com");
  });

  test("rejects an invalid mode", () => {
    expect(() => parseArgs(["--mode", "foo"])).toThrow("Invalid --mode value: foo");
  });
});
