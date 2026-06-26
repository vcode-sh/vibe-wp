import { dirname } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app/app";
import { devModeOverride } from "./app/dev-step";
import { applyCliState } from "./cli/apply-cli-state";
import { DEFAULT_INSTALL_DIR, parseArgs } from "./cli/args";
import { runHeadlessJson } from "./cli/headless-cli";
import { runLocalWorkflowCli } from "./cli/local-workflow-cli";
import { usage } from "./cli/usage";
import { defaultState, INSTALLER_VERSION } from "./core/defaults";
import { detectHostFacts } from "./core/host";
import { buildInstallPlan } from "./core/install-plan";
import { openJournal } from "./core/journal";
import { applyLocalSandboxDefaults, createLocalSandboxHostFacts } from "./core/local-sandbox";
import { runPlan } from "./core/plan-runner";
import { redactPlan } from "./core/redaction";
import { writeSupportBundle } from "./core/support-bundle";
import type { InstallerOptions } from "./core/types";

// Non-interactive (no-TUI) modes. Returns true when it handled the run.
async function runNonInteractive(options: InstallerOptions): Promise<boolean> {
  if (options.help) {
    console.log(usage());
    return true;
  }
  if (options.version) {
    console.log(INSTALLER_VERSION);
    return true;
  }
  if (options.headlessJson) {
    await runHeadlessJson();
    return true;
  }
  if (await runLocalWorkflowCli(options)) {
    return true;
  }
  if (options.supportBundle) {
    const host = options.local ? createLocalSandboxHostFacts() : await detectHostFacts();
    const plan = options.headlessPlan ? await Bun.file(options.headlessPlan).json() : undefined;
    const journalDir = options.headlessPlan
      ? `${dirname(options.headlessPlan)}/.vibe-installer`
      : undefined;
    const out = await writeSupportBundle({ outDir: options.supportBundle, host, plan, journalDir });
    console.log(`Support bundle written to ${out} (redacted — safe to share).`);
    return true;
  }
  if (options.headlessPlan) {
    const plan = await Bun.file(options.headlessPlan).json();
    // Persist progress next to the plan so a failed/interrupted run can --resume.
    const journal = await openJournal(
      `${dirname(options.headlessPlan)}/.vibe-installer`,
      options.resume
    );
    const results = await runPlan(plan, options.yes, {}, journal);
    console.log(JSON.stringify(results, null, 2));
    return true;
  }
  return false;
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));

  if (await runNonInteractive(options)) {
    return;
  }

  const host = options.local ? createLocalSandboxHostFacts() : await detectHostFacts();
  const state = options.local ? applyLocalSandboxDefaults(defaultState(host)) : defaultState(host);
  const devMode = devModeOverride();
  if (options.local && devMode) {
    state.mode = devMode;
    if (host.existingSites[0]) {
      state.selectedSiteDir = host.existingSites[0].installDir;
    }
  }
  if (!options.local || options.installDir !== DEFAULT_INSTALL_DIR) {
    state.installDir = options.installDir;
  }
  state.repo = options.repo;
  state.ref = options.ref;
  if (options.noHostInstall) {
    state.installDocker = false;
    state.installCaddy = false;
    state.installRclone = false;
    state.hardenServer = false;
  }
  if (options.noHarden) {
    state.hardenServer = false;
  }
  if (options.noMonitor) {
    state.monitorEnabled = false;
  }
  if (options.noCaddy) {
    state.installCaddy = false;
  }
  if (options.noWww) {
    state.wwwAlias = false;
  }
  if (options.purge) {
    state.fullDelete = true;
  }
  if (options.bootstrapPanel) {
    state.mode = "panel-bootstrap";
  }
  applyCliState(state, options);

  // Pass the owner password to spawned bin/panel via environment rather than
  // argv so it never appears in --dry-run output, --export-plan JSON, or `ps`.
  // Bun.spawn inherits process.env, so setting it here covers both the
  // interactive (TUI) render path and any non-interactive execution path.
  if (state.adminPassword) {
    process.env.VIBE_PANEL_ADMIN_PASSWORD = state.adminPassword;
  }

  const plan = buildInstallPlan(state);

  if (options.dryRun) {
    console.log(JSON.stringify(redactPlan(plan), null, 2));
    return;
  }

  if (options.exportPlan) {
    await Bun.write(options.exportPlan, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(
      `Full plan exported to ${options.exportPlan}. Keep it private because it contains generated secrets.`
    );
    return;
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(<App initialState={state} options={options} />);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
