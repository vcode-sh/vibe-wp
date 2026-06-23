import { describe, expect, it } from "bun:test";
import { defaultState, emptyHostFacts } from "./defaults";
import { buildPanelBootstrapPlan } from "./panel-bootstrap-plan";

function bareState() {
  const host = { ...emptyHostFacts(), sudo: true, publicIp: "203.0.113.7" };
  const state = defaultState(host);
  state.mode = "panel-bootstrap";
  state.panelAccessMode = "magic-dns";
  state.adminEmail = "you@acme.com";
  state.adminPassword = "supersecret";
  state.installDocker = true;
  state.installCaddy = true;
  state.installBun = true;
  return state;
}

describe("buildPanelBootstrapPlan", () => {
  it("orders host installs before the panel install", () => {
    const ids = buildPanelBootstrapPlan(bareState()).tasks.map((t) => t.id);
    expect(ids).toEqual(["install-docker", "install-caddy", "install-bun", "panel-install"]);
  });

  it("passes the access mode + owner email to bin/panel, omits --admin-password and --domain for magic-dns", () => {
    const plan = buildPanelBootstrapPlan(bareState());
    const panel = plan.tasks.find((t) => t.id === "panel-install");
    const line = panel?.command?.[2] ?? "";
    expect(line).toContain("/opt/vibe-wp/bin/panel install");
    expect(line).toContain("--access magic-dns");
    expect(line).toContain("--admin-email 'you@acme.com'");
    // Password must NOT appear in the command (passed via VIBE_PANEL_ADMIN_PASSWORD env instead)
    expect(line).not.toContain("--admin-password");
    expect(line).not.toContain("supersecret");
    expect(line).not.toContain("--domain");
  });

  it("includes a DNS preflight only for domain mode", () => {
    const s = bareState();
    s.panelAccessMode = "domain";
    s.productionDomain = "panel.acme.com";
    const ids = buildPanelBootstrapPlan(s).tasks.map((t) => t.id);
    expect(ids[0]).toBe("dns-preflight");
  });
});
