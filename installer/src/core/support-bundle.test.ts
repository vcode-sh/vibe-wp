import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyHostFacts } from "./defaults";
import { writeSupportBundle } from "./support-bundle";
import type { InstallPlan } from "./types";

function plan(): InstallPlan {
  return {
    version: "t",
    generatedAt: "now",
    installDir: "/tmp/x",
    localSandbox: false,
    repo: "",
    ref: "main",
    siteSlug: "x",
    domains: { production: "shop.test", wwwAlias: false, stagingEnabled: false, staging: "" },
    envFiles: [
      { path: "/x/env/prod.env", values: { MARIADB_PASSWORD: "supersecret", WP_HOME: "https://x" } }
    ],
    caddyfile: "",
    tasks: [],
    warnings: [],
    summary: {
      productionUrl: "",
      adminUrl: "",
      stagingUrl: "disabled",
      installDir: "/tmp/x",
      siteSlug: "x",
      performancePreset: "balanced",
      backupPolicy: "manual"
    }
  };
}

describe("writeSupportBundle", () => {
  test("bundles host facts, journal files, and a REDACTED plan", async () => {
    const base = await mkdtemp(join(tmpdir(), "vibe-sb-"));
    await writeFile(join(base, "state.json"), '{"results":[]}');
    await writeFile(join(base, "install.log"), "[done] checkout\n");

    const out = await writeSupportBundle({
      outDir: base,
      host: emptyHostFacts(),
      plan: plan(),
      journalDir: base
    });

    const redactedPlan = await readFile(`${out}/plan.redacted.json`, "utf8");
    expect(redactedPlan).not.toContain("supersecret");
    expect(await readFile(`${out}/host.json`, "utf8")).toContain("osName");
    expect(await readFile(`${out}/install.log`, "utf8")).toContain("[done] checkout");
  });
});
