import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openJournal } from "./journal";
import { runPlan } from "./plan-runner";
import type { InstallPlan } from "./types";

function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vibe-journal-"));
}

function planWith(ids: string[]): InstallPlan {
  return {
    version: "test",
    generatedAt: "now",
    installDir: "/tmp/x",
    localSandbox: true,
    repo: "",
    ref: "main",
    siteSlug: "x",
    domains: { production: "x", wwwAlias: false, stagingEnabled: false, staging: "" },
    envFiles: [],
    caddyfile: "",
    tasks: ids.map((id) => ({ id, title: id, description: id, command: ["sh", "-lc", "true"] })),
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

describe("journal + resume", () => {
  test("records completed tasks to state.json and install.log", async () => {
    const dir = await tempDir();
    const journal = await openJournal(dir, false);
    await journal.record({ id: "checkout", status: "done", output: "ok", code: 0 });
    const state = JSON.parse(await readFile(`${dir}/state.json`, "utf8"));
    expect(state.results[0].id).toBe("checkout");
    expect(await readFile(`${dir}/install.log`, "utf8")).toContain("[done] checkout");
  });

  test("resume reads completed ids and runPlan skips them", async () => {
    const dir = await tempDir();
    const first = await openJournal(dir, false);
    await first.record({ id: "a", status: "done", output: "", code: 0 });
    await first.record({ id: "b", status: "failed", output: "boom", code: 1 });

    const resumed = await openJournal(dir, true);
    expect(resumed.completed.has("a")).toBe(true);
    expect(resumed.completed.has("b")).toBe(false);

    const results = await runPlan(planWith(["a", "b", "c"]), true, {}, resumed);
    expect(results[0]?.output).toContain("already completed");
    expect(results.map((r) => r.status)).toEqual(["done", "done", "done"]);
  });
});
