import type { InstallMode } from "../core/types";
import type { Step, StepId } from "./steps";
import { steps } from "./steps";

// Dynamic wizard flow: each mode reveals only the steps it actually needs, so a
// "Manage" run no longer drags the user through Domain/Admin/Performance/etc.
// This is navigation/presentation only — the core/ planner already branches.
// Essentials first (domain, admin), then options (staging, performance, backup,
// ai), with the advanced Location step kept just before review.
const FULL: StepId[] = [
  "welcome",
  "sites",
  "system",
  "domain",
  "admin",
  "staging",
  "performance",
  "backup",
  "monitoring",
  "ai",
  "mode",
  "review",
  "execute",
  "success"
];

// Quick new-site: ask only what we cannot guess (domain + admin email) and let
// smart defaults handle everything else, so the happy path is Enter-Enter-done.
const QUICK_NEW_SITE: StepId[] = [
  "welcome",
  "sites",
  "domain",
  "admin",
  "review",
  "execute",
  "success"
];

// Bring-your-own MariaDB/Redis: same build flow as new-site but with the two
// connection screens after Domain, and no bundled staging step.
const EXTERNAL: StepId[] = [
  "welcome",
  "sites",
  "system",
  "domain",
  "external-db",
  "external-redis",
  "admin",
  "performance",
  "backup",
  "monitoring",
  "ai",
  "mode",
  "review",
  "execute",
  "success"
];

function visibleStepIds(mode: InstallMode, quickInstall: boolean): StepId[] {
  switch (mode) {
    case "external-services":
      return EXTERNAL;
    case "manage-existing":
      return ["welcome", "sites", "dashboard"];
    case "remove-existing":
      return ["welcome", "sites", "review", "execute", "success"];
    case "update-existing":
      return ["welcome", "sites", "system", "mode", "performance", "review", "execute", "success"];
    case "staging-only":
      return ["welcome", "sites", "system", "domain", "staging", "review", "execute", "success"];
    default:
      // new-site needs the full build flow, unless the user picked quick install.
      if (mode === "new-site" && quickInstall) {
        return QUICK_NEW_SITE;
      }
      return FULL;
  }
}

export function visibleSteps(mode: InstallMode, quickInstall = false): Step[] {
  const order = visibleStepIds(mode, quickInstall);
  const rank = new Map(order.map((id, index) => [id, index]));
  return steps
    .filter((step) => rank.has(step.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
