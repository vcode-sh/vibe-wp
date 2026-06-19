import { expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildBackupsListTask, buildOperationTask, MANAGE_OPERATIONS } from "./manage-operations";

function cmd(parts: string[] | undefined): string {
  return parts?.join(" ") ?? "";
}

const state = (() => {
  const s = defaultState();
  s.selectedSiteDir = "/opt/vibe-wp";
  return s;
})();

test("restore op appends the chosen backup path and --yes", () => {
  const restore = MANAGE_OPERATIONS.find((op) => op.id === "restore");
  expect(restore?.needsBackup).toBe(true);
  const task = buildOperationTask(
    restore as (typeof MANAGE_OPERATIONS)[number],
    state,
    "backups/prod/X"
  );
  expect(cmd(task.command)).toContain("./bin/vibe prod restore 'backups/prod/X' --yes");
});

test("safe ops never append --yes", () => {
  const health = MANAGE_OPERATIONS.find((op) => op.id === "health");
  const task = buildOperationTask(health as (typeof MANAGE_OPERATIONS)[number], state);
  expect(cmd(task.command)).toContain("./bin/vibe prod smoke");
  expect(cmd(task.command)).not.toContain("--yes");
});

test("logs op uses the non-following logs-recent command", () => {
  const logs = MANAGE_OPERATIONS.find((op) => op.id === "logs");
  expect(logs?.vibeCommand).toBe("logs-recent");
});

test("buildBackupsListTask lists backups for the env", () => {
  expect(cmd(buildBackupsListTask("prod", state).command)).toContain("./bin/vibe prod backups");
});
