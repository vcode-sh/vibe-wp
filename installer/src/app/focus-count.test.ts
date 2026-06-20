import { expect, test } from "bun:test";
import { defaultState } from "../core/defaults";
import { PERFORMANCE_FIELDS } from "../core/performance";
import type { StepId } from "./steps";
import { focusCountFor, steps } from "./steps";

function step(id: StepId) {
  const found = steps.find((s) => s.id === id);
  if (!found) {
    throw new Error(`missing step ${id}`);
  }
  return found;
}

test("performance step grows when customization is on", () => {
  const state = defaultState();
  state.performanceCustom = true;
  expect(focusCountFor(step("performance"), state)).toBe(3 + PERFORMANCE_FIELDS.length);
});

test("performance step is compact when customization is off", () => {
  const state = defaultState();
  state.performanceCustom = false;
  expect(focusCountFor(step("performance"), state)).toBe(3);
});

test("other steps keep their static focus count", () => {
  const state = defaultState();
  const domain = step("domain");
  expect(focusCountFor(domain, state)).toBe(domain.focusCount);
});
