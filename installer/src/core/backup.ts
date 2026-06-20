import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Suggested local backup root for a site; prod/stage land in sub-directories.
export function suggestedBackupDir(slug: string): string {
  return `/var/backups/vibe-wp/${slug || "vibe-wp"}`;
}

export function r2Endpoint(accountId: string): string {
  const id = accountId.trim();
  return id ? `https://${id}.r2.cloudflarestorage.com` : "";
}

export function backupEnabled(state: InstallerState): boolean {
  return state.backupPolicy !== "manual";
}

// systemd OnCalendar expression for the chosen cadence (empty when off).
export function backupOnCalendar(schedule: string): string {
  if (schedule === "daily") {
    return "*-*-* 03:30:00";
  }
  if (schedule === "weekly") {
    return "Sun *-*-* 03:30:00";
  }
  return "";
}

// Backup-related env keys written into every env file. R2 stays disabled unless
// the user opted into off-server copies; rclone reads RCLONE_CONFIG_R2_* itself.
export function backupEnvValues(state: InstallerState, envName: string): Record<string, string> {
  const base = state.backupDir.trim() || suggestedBackupDir(state.siteSlug);
  return {
    VIBE_BACKUP_DIR: `${base}/${envName}`,
    VIBE_BACKUP_RETENTION: state.backupRetention.trim() || "7",
    VIBE_BACKUP_R2_ENABLED: state.backupR2Enabled ? "1" : "0",
    VIBE_BACKUP_R2_BUCKET: state.r2Bucket.trim(),
    VIBE_BACKUP_R2_PREFIX: `${state.siteSlug}-${envName}`,
    RCLONE_CONFIG_R2_TYPE: "s3",
    RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
    RCLONE_CONFIG_R2_ACCESS_KEY_ID: state.r2AccessKeyId.trim(),
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: state.r2SecretKey,
    RCLONE_CONFIG_R2_ENDPOINT: r2Endpoint(state.r2AccountId),
    RCLONE_CONFIG_R2_ACL: "private",
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true"
  };
}

// Host task that installs rclone when off-server backups are enabled.
export function buildRcloneInstallTask(state: InstallerState): InstallTask | null {
  if (!(state.backupR2Enabled && state.installRclone)) {
    return null;
  }
  const sudo = state.host.sudo ? "sudo " : "";
  return {
    id: "install-rclone",
    title: "Install rclone",
    description: "Install rclone for fast off-server backups to Cloudflare R2.",
    privileged: true,
    command: [
      "sh",
      "-lc",
      `command -v rclone >/dev/null 2>&1 || curl -fsSL https://rclone.org/install.sh | ${sudo}bash`
    ]
  };
}

// Host task that creates the local backup directory.
export function buildBackupDirTask(state: InstallerState): InstallTask | null {
  if (!backupEnabled(state)) {
    return null;
  }
  const sudo = state.host.sudo ? "sudo " : "";
  const dir = shellQuote(state.backupDir.trim() || suggestedBackupDir(state.siteSlug));
  return {
    id: "backup-dir",
    title: "Create backup folder",
    description: "Create the local backup directory with restricted permissions.",
    privileged: true,
    command: ["sh", "-lc", `${sudo}install -d -m 0750 ${dir}`]
  };
}

// Host task that installs a systemd service + timer for scheduled backups.
export function buildBackupTimerTask(state: InstallerState, envName: string): InstallTask | null {
  if (!backupEnabled(state) || state.backupSchedule === "off") {
    return null;
  }
  const onCalendar = backupOnCalendar(state.backupSchedule);
  if (!onCalendar) {
    return null;
  }
  const sudo = state.host.sudo ? "sudo " : "";
  const unit = `vibe-wp-backup-${state.siteSlug}-${envName}`;
  const dir = state.installDir;
  const service = [
    "[Unit]",
    `Description=Vibe WP backup for ${state.siteSlug} (${envName})`,
    "After=docker.service",
    "[Service]",
    "Type=oneshot",
    `WorkingDirectory=${dir}`,
    `ExecStart=${dir}/bin/vibe ${envName} backup`
  ].join("\n");
  const timer = [
    "[Unit]",
    `Description=Scheduled Vibe WP backup for ${state.siteSlug} (${envName})`,
    "[Timer]",
    `OnCalendar=${onCalendar}`,
    "Persistent=true",
    "[Install]",
    "WantedBy=timers.target"
  ].join("\n");
  const command = [
    `printf '%s\\n' ${shellQuote(service)} | ${sudo}tee /etc/systemd/system/${unit}.service >/dev/null`,
    `printf '%s\\n' ${shellQuote(timer)} | ${sudo}tee /etc/systemd/system/${unit}.timer >/dev/null`,
    `${sudo}systemctl daemon-reload`,
    `${sudo}systemctl enable --now ${unit}.timer`
  ].join(" && ");
  return {
    id: "backup-timer",
    title: "Schedule automatic backups",
    description: `Install a systemd timer running backups ${state.backupSchedule}.`,
    privileged: true,
    command: ["sh", "-lc", command]
  };
}
