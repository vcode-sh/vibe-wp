import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app/app";
import { DEFAULT_INSTALL_DIR, parseArgs, usage } from "./cli/args";
import { defaultState, INSTALLER_VERSION } from "./core/defaults";
import { detectHostFacts } from "./core/host";
import { buildInstallPlan } from "./core/install-plan";
import { applyLocalSandboxDefaults, createLocalSandboxHostFacts } from "./core/local-sandbox";
import { redactPlan } from "./core/redaction";
import { runPlan } from "./core/task-runner";

async function main() {
  const options = parseArgs(Bun.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.version) {
    console.log(INSTALLER_VERSION);
    return;
  }

  if (options.headlessPlan) {
    const plan = await Bun.file(options.headlessPlan).json();
    const results = await runPlan(plan, options.yes);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const host = options.local ? createLocalSandboxHostFacts() : await detectHostFacts();
  const state = options.local ? applyLocalSandboxDefaults(defaultState(host)) : defaultState(host);
  if (!options.local || options.installDir !== DEFAULT_INSTALL_DIR) {
    state.installDir = options.installDir;
  }
  state.repo = options.repo;
  state.ref = options.ref;
  if (options.noHostInstall) {
    state.installDocker = false;
    state.installCaddy = false;
  }
  if (options.noCaddy) {
    state.installCaddy = false;
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
