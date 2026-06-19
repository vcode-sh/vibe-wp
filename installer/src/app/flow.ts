import type { InstallMode } from "../core/types";
import type { Step, StepId } from "./steps";
import { steps } from "./steps";

// Dynamic wizard flow: each mode reveals only the steps it actually needs, so a
// "Manage" run no longer drags the user through Domain/Admin/Performance/etc.
// This is navigation/presentation only — the core/ planner already branches.
const FULL: StepId[] = [
  "welcome",
  "sites",
  "system",
  "domain",
  "mode",
  "admin",
  "performance",
  "ai",
  "backup",
  "staging",
  "review",
  "execute",
  "success"
];

function visibleStepIds(mode: InstallMode): StepId[] {
  switch (mode) {
    case "manage-existing":
    case "remove-existing":
      return ["welcome", "sites", "review", "execute", "success"];
    case "update-existing":
      return ["welcome", "sites", "system", "mode", "performance", "review", "execute", "success"];
    case "staging-only":
      return ["welcome", "sites", "system", "domain", "staging", "review", "execute", "success"];
    default:
      // new-site and external-services need the full build flow.
      return FULL;
  }
}

export function visibleSteps(mode: InstallMode): Step[] {
  const ids = new Set(visibleStepIds(mode));
  return steps.filter((step) => ids.has(step.id));
}
