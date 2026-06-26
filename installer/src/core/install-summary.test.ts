import { describe, expect, test } from "bun:test";
import { buildInstallSummaryLines } from "./install-summary";
import type { TaskResult } from "./task-runner";
import type { InstallPlan } from "./types";

const SECRET_WORD_RE = /password|secret|salt/i;

const PLAN: InstallPlan = {
  caddyfile: "",
  domains: {
    production: "demo.test",
    staging: "stage.demo.test",
    stagingEnabled: true,
    wwwAlias: false
  },
  envFiles: [],
  generatedAt: "2026-06-26T10:00:00.000Z",
  installDir: "/opt/vibe-wp-demo",
  localSandbox: false,
  ref: "main",
  repo: "https://github.com/example/vibe-wp.git",
  siteSlug: "demo",
  summary: {
    adminUrl: "https://demo.test/wp-admin",
    backupPolicy: "daily",
    installDir: "/opt/vibe-wp-demo",
    performancePreset: "balanced",
    productionUrl: "https://demo.test",
    stagingUrl: "https://stage.demo.test"
  },
  tasks: [],
  version: "0.1.5",
  warnings: []
};

describe("buildInstallSummaryLines", () => {
  test("prints success next steps without secrets", () => {
    const lines = buildInstallSummaryLines(PLAN, [
      { code: 0, id: "checkout", output: "ok", status: "done" }
    ]);

    expect(lines).toContain("Install summary");
    expect(lines).toContain("Site: https://demo.test");
    expect(lines).toContain("Admin: https://demo.test/wp-admin");
    expect(lines).toContain("Staging: https://stage.demo.test");
    expect(lines).toContain("Resume: bun run src/main.tsx --resume --yes");
    expect(lines.join("\n")).not.toMatch(SECRET_WORD_RE);
  });

  test("prints failure recovery commands with the failed task id", () => {
    const failed: TaskResult = {
      code: 1,
      id: "prod-smoke",
      output: "failed",
      status: "failed"
    };

    const lines = buildInstallSummaryLines(PLAN, [failed]);

    expect(lines).toContain("Install stopped at task: prod-smoke");
    expect(lines).toContain("Retry after fixing the issue: bun run src/main.tsx --resume --yes");
    expect(lines).toContain(
      "Support bundle: bun run src/main.tsx --support-bundle ./support-bundle"
    );
    expect(lines.join("\n")).not.toContain("failed");
  });
});
