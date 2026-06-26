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

  test("parses --bootstrap-panel and --access", () => {
    const o = parseArgs(["--bootstrap-panel", "--access", "magic-dns", "--admin-email", "a@b.c"]);
    expect(o.bootstrapPanel).toBe(true);
    expect(o.access).toBe("magic-dns");
  });

  test("rejects an invalid --access value", () => {
    expect(() => parseArgs(["--access", "nope"])).toThrow("Invalid --access value: nope");
  });

  test("parses local workflow headless flags", () => {
    const options = parseArgs([
      "--local-inventory",
      "--local-create",
      "demo",
      "--local-domain",
      "demo.vibe.local",
      "--local-title",
      "Demo",
      "--local-root",
      ".vibe-local",
      "--local-reset",
      "demo",
      "--local-delete",
      "old",
      "--yes"
    ]);

    expect(options.localInventory).toBe(true);
    expect(options.localCreate).toBe("demo");
    expect(options.localDomain).toBe("demo.vibe.local");
    expect(options.localTitle).toBe("Demo");
    expect(options.localRoot).toBe(".vibe-local");
    expect(options.localReset).toBe("demo");
    expect(options.localDelete).toBe("old");
    expect(options.yes).toBe(true);
  });
});
