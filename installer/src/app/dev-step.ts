import type { InstallMode } from "../core/types";
import { visibleSteps } from "./flow";

// Dev-only: override the starting mode for headless capture of other flows.
export function devModeOverride(): InstallMode | undefined {
  const raw = process.env.VIBE_DEV_MODE as InstallMode | undefined;
  return raw || undefined;
}

// Dev-only: jump straight to a step for headless UI capture (VIBE_DEV_STEP=<id|index>),
// resolved against the active mode's visible flow so the index lines up.
export function initialStepIndex(mode: InstallMode): number {
  const raw = process.env.VIBE_DEV_STEP;
  if (!raw) {
    return 0;
  }
  const flow = visibleSteps(mode);
  const byId = flow.findIndex((step) => step.id === raw);
  if (byId >= 0) {
    return byId;
  }
  const asNumber = Number(raw);
  return Number.isInteger(asNumber) && asNumber >= 0 && asNumber < flow.length ? asNumber : 0;
}
