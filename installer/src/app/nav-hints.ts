import type { StepId } from "./steps";

// What kind of input each screen primarily uses, so the footer can show the
// exact keys that do something here (the #1 source of "how do I select?").
export type StepKind = "action" | "choice" | "toggles" | "fields" | "mixed" | "done";

const STEP_KIND: Record<StepId, StepKind> = {
  welcome: "action",
  sites: "choice",
  dashboard: "choice",
  system: "toggles",
  domain: "mixed",
  mode: "fields",
  admin: "fields",
  panel: "mixed",
  performance: "choice",
  ai: "fields",
  backup: "choice",
  monitoring: "mixed",
  staging: "mixed",
  "external-db": "fields",
  "external-redis": "fields",
  review: "action",
  execute: "fields",
  success: "done"
};

export function stepKind(id: StepId): StepKind {
  return STEP_KIND[id];
}
