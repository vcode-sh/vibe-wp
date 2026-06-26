import type { TaskResult } from "./task-runner";
import type { InstallPlan } from "./types";

export function buildInstallSummaryLines(plan: InstallPlan, results: TaskResult[]): string[] {
  const failed = results.find((result) => result.status === "failed");
  if (failed) {
    return [
      "Recovery summary",
      `Install stopped at task: ${failed.id}`,
      "Retry after fixing the issue: bun run src/main.tsx --resume --yes",
      "Support bundle: bun run src/main.tsx --support-bundle ./support-bundle",
      `Install directory: ${plan.installDir}`
    ];
  }

  const lines = [
    "Install summary",
    `Site: ${plan.summary.productionUrl ?? `https://${plan.domains.production}`}`,
    `Admin: ${plan.summary.adminUrl ?? `https://${plan.domains.production}/wp-admin`}`
  ];
  if (plan.domains.stagingEnabled) {
    lines.push(`Staging: ${plan.summary.stagingUrl ?? `https://${plan.domains.staging}`}`);
  }
  lines.push(
    `Install directory: ${plan.installDir}`,
    "Resume: bun run src/main.tsx --resume --yes",
    "Support bundle: bun run src/main.tsx --support-bundle ./support-bundle"
  );
  return lines;
}
