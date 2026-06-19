import { steps } from "./steps";

// Dev-only: jump straight to a step for headless UI capture (VIBE_DEV_STEP=<id|index>).
export function initialStepIndex(): number {
  const raw = process.env.VIBE_DEV_STEP;
  if (!raw) {
    return 0;
  }
  const byId = steps.findIndex((step) => step.id === raw);
  if (byId >= 0) {
    return byId;
  }
  const asNumber = Number(raw);
  return Number.isInteger(asNumber) && asNumber >= 0 && asNumber < steps.length ? asNumber : 0;
}
