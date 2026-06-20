import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildInstallPlan } from "./install-plan";
import { buildMonitorTimerTask, monitorEnvValues } from "./monitor";

describe("monitorEnvValues", () => {
  test("writes thresholds and the user's alert channels", () => {
    const state = defaultState();
    state.monitorEmail = "ops@example.com";
    state.monitorWebhookUrl = "https://hooks.example.com/x";
    const v = monitorEnvValues(state);
    expect(v.VIBE_MONITOR_DISK_WARN_PCT).toBe("85");
    expect(v.VIBE_MONITOR_EMAIL_TO).toBe("ops@example.com");
    expect(v.VIBE_MONITOR_WEBHOOK_URL).toBe("https://hooks.example.com/x");
  });

  test("includes Telegram channel from state", () => {
    const state = defaultState();
    state.monitorTelegramToken = "123:abc";
    state.monitorTelegramChat = "999";
    const v = monitorEnvValues(state);
    expect(v.VIBE_MONITOR_TELEGRAM_TOKEN).toBe("123:abc");
    expect(v.VIBE_MONITOR_TELEGRAM_CHAT_ID).toBe("999");
  });
});

describe("buildMonitorTimerTask", () => {
  test("installs an hourly per-site monitor timer when enabled", () => {
    const state = defaultState();
    state.siteSlug = "shop";
    state.monitorEnabled = true;
    const task = buildMonitorTimerTask(state, "prod");
    expect(task?.id).toBe("monitor-timer");
    const cmd = (task?.command ?? []).join(" ");
    expect(cmd).toContain("vibe-wp-monitor-shop-prod.timer");
    expect(cmd).toContain("OnCalendar=hourly");
    expect(cmd).toContain("/bin/vibe prod monitor --quiet");
  });

  test("is skipped when monitoring is disabled", () => {
    const state = defaultState();
    state.monitorEnabled = false;
    expect(buildMonitorTimerTask(state, "prod")).toBeNull();
  });

  test("new-site plan includes the monitor timer by default", () => {
    const state = defaultState();
    state.mode = "new-site";
    const ids = buildInstallPlan(state).tasks.map((t) => t.id);
    expect(ids).toContain("monitor-timer");
  });
});
