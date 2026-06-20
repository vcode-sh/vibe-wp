import { describe, expect, test } from "bun:test";
import {
  backupEnvValues,
  backupOnCalendar,
  buildBackupDirTask,
  buildBackupTimerTask,
  buildRcloneInstallTask,
  r2Endpoint,
  suggestedBackupDir
} from "./backup";
import { defaultState } from "./defaults";
import type { InstallerState, InstallTask } from "./types";

function taskCommand(task: InstallTask | null): string {
  if (!task) {
    throw new Error("expected a task");
  }
  return (task.command ?? []).join(" ");
}

function r2State(): InstallerState {
  const state = defaultState();
  state.siteSlug = "shop";
  state.backupPolicy = "external-later";
  state.backupR2Enabled = true;
  state.backupDir = "/var/backups/vibe-wp/shop";
  state.backupRetention = "5";
  state.backupSchedule = "daily";
  state.r2AccountId = "abc123";
  state.r2AccessKeyId = "AKID";
  state.r2SecretKey = "SECRETV";
  state.r2Bucket = "shop-backups";
  state.installDir = "/opt/vibe-wp-sites/shop";
  return state;
}

describe("backupEnvValues", () => {
  test("nests the backup dir under the env name and builds the R2 endpoint", () => {
    const v = backupEnvValues(r2State(), "prod");
    expect(v.VIBE_BACKUP_DIR).toBe("/var/backups/vibe-wp/shop/prod");
    expect(v.VIBE_BACKUP_R2_ENABLED).toBe("1");
    expect(v.VIBE_BACKUP_R2_BUCKET).toBe("shop-backups");
    expect(v.RCLONE_CONFIG_R2_ENDPOINT).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(v.RCLONE_CONFIG_R2_SECRET_ACCESS_KEY).toBe("SECRETV");
    expect(v.VIBE_BACKUP_R2_PREFIX).toBe("shop-prod");
  });

  test("keeps R2 disabled and endpoint empty when off", () => {
    const state = defaultState();
    state.backupR2Enabled = false;
    state.r2AccountId = "";
    const v = backupEnvValues(state, "prod");
    expect(v.VIBE_BACKUP_R2_ENABLED).toBe("0");
    expect(v.RCLONE_CONFIG_R2_ENDPOINT).toBe("");
  });
});

describe("backup host tasks", () => {
  test("rclone install task only appears when R2 is on and host install is allowed", () => {
    const state = r2State();
    expect(buildRcloneInstallTask(state)?.id).toBe("install-rclone");
    state.installRclone = false;
    expect(buildRcloneInstallTask(state)).toBeNull();
    const noR2 = defaultState();
    noR2.backupR2Enabled = false;
    expect(buildRcloneInstallTask(noR2)).toBeNull();
  });

  test("backup dir task is skipped for manual policy", () => {
    const state = r2State();
    expect(taskCommand(buildBackupDirTask(state))).toContain("/var/backups/vibe-wp/shop");
    state.backupPolicy = "manual";
    expect(buildBackupDirTask(state)).toBeNull();
  });

  test("timer task encodes the schedule and a per-site unit name", () => {
    const state = r2State();
    expect(buildBackupTimerTask(state, "prod")?.id).toBe("backup-timer");
    const command = taskCommand(buildBackupTimerTask(state, "prod"));
    expect(command).toContain("vibe-wp-backup-shop-prod.timer");
    expect(command).toContain("OnCalendar=*-*-* 03:30:00");
    state.backupSchedule = "off";
    expect(buildBackupTimerTask(state, "prod")).toBeNull();
  });

  test("OnCalendar maps cadences", () => {
    expect(backupOnCalendar("daily")).toContain("03:30:00");
    expect(backupOnCalendar("weekly")).toContain("Sun");
    expect(backupOnCalendar("off")).toBe("");
  });

  test("suggested dir and endpoint helpers", () => {
    expect(suggestedBackupDir("shop")).toBe("/var/backups/vibe-wp/shop");
    expect(r2Endpoint("")).toBe("");
  });
});
