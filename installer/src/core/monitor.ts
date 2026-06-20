import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Health-monitoring env keys written into every env file. Thresholds get sane
// defaults; alert channels stay blank unless the user provides them.
export function monitorEnvValues(state: InstallerState): Record<string, string> {
  return {
    VIBE_MONITOR_DISK_WARN_PCT: "85",
    VIBE_MONITOR_CERT_WARN_DAYS: "14",
    VIBE_MONITOR_BACKUP_MAX_AGE_HOURS: "26",
    VIBE_MONITOR_ALERT_ON_WARN: "0",
    VIBE_MONITOR_EMAIL_TO: state.monitorEmail.trim(),
    VIBE_MONITOR_WEBHOOK_URL: state.monitorWebhookUrl.trim(),
    VIBE_MONITOR_TELEGRAM_TOKEN: "",
    VIBE_MONITOR_TELEGRAM_CHAT_ID: ""
  };
}

// Host task: a systemd service + timer that runs health checks (and alerts)
// hourly, so problems surface before a visitor notices. Skipped when disabled.
export function buildMonitorTimerTask(state: InstallerState, envName: string): InstallTask | null {
  if (!state.monitorEnabled) {
    return null;
  }
  const sudo = state.host.sudo ? "sudo " : "";
  const unit = `vibe-wp-monitor-${state.siteSlug}-${envName}`;
  const dir = state.installDir;
  const service = [
    "[Unit]",
    `Description=Vibe WP health monitor for ${state.siteSlug} (${envName})`,
    "After=docker.service",
    "[Service]",
    "Type=oneshot",
    `WorkingDirectory=${dir}`,
    `ExecStart=${dir}/bin/vibe ${envName} monitor --quiet`
  ].join("\n");
  const timer = [
    "[Unit]",
    `Description=Hourly Vibe WP health monitor for ${state.siteSlug} (${envName})`,
    "[Timer]",
    "OnCalendar=hourly",
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
    id: "monitor-timer",
    title: "Schedule health monitoring",
    description: "Install an hourly systemd timer that runs health checks and sends alerts.",
    privileged: true,
    command: ["sh", "-lc", command]
  };
}
