import { copyFile, mkdir } from "node:fs/promises";
import { redactPlan } from "./redaction";
import type { HostFacts, InstallPlan } from "./types";

// A redacted, shareable diagnostics bundle: host facts, the install journal
// (state.json + install.log), and the redacted plan. Never includes secrets —
// the plan is run through redactPlan and host facts carry no credentials.
export interface SupportBundleInput {
  host: HostFacts;
  journalDir?: string;
  outDir: string;
  plan?: InstallPlan;
}

export async function writeSupportBundle(input: SupportBundleInput): Promise<string> {
  const dir = `${input.outDir}/vibe-wp-support`;
  await mkdir(dir, { recursive: true });

  await Bun.write(`${dir}/host.json`, `${JSON.stringify(input.host, null, 2)}\n`);

  if (input.plan) {
    await Bun.write(
      `${dir}/plan.redacted.json`,
      `${JSON.stringify(redactPlan(input.plan), null, 2)}\n`
    );
  }

  if (input.journalDir) {
    for (const name of ["state.json", "install.log"]) {
      const source = Bun.file(`${input.journalDir}/${name}`);
      if (await source.exists()) {
        await copyFile(`${input.journalDir}/${name}`, `${dir}/${name}`);
      }
    }
  }

  return dir;
}
