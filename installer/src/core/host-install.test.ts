import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildHostInstallTasks } from "./host-install";
import type { HostFacts } from "./types";

function hostState(overrides: Partial<HostFacts>) {
  const state = defaultState();
  state.host = { ...state.host, ...overrides };
  state.installDocker = !overrides.docker;
  state.installCaddy = !overrides.caddy;
  return state;
}

describe("buildHostInstallTasks", () => {
  test("installs Docker and Caddy when missing", () => {
    const state = hostState({ docker: null, caddy: null });
    const ids = buildHostInstallTasks(state).map((t) => t.id);
    expect(ids).toContain("install-docker");
    expect(ids).toContain("install-caddy");
  });

  test("skips installs when already present", () => {
    const state = hostState({ docker: "Docker 27", caddy: "Caddy 2" });
    expect(buildHostInstallTasks(state).map((t) => t.id)).toEqual([]);
  });

  test("adds rclone only when R2 backups are enabled", () => {
    const state = hostState({ docker: "Docker 27", caddy: "Caddy 2" });
    state.backupR2Enabled = true;
    state.installRclone = true;
    expect(buildHostInstallTasks(state).map((t) => t.id)).toContain("install-rclone");
  });
});
