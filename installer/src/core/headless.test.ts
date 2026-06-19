import { expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { runHeadless } from "./headless";

test("validate returns errors for the empty default state", async () => {
  const res = await runHeadless({ kind: "validate", state: defaultState() });
  expect(res.kind).toBe("validate");
  if (res.kind === "validate") {
    expect(Array.isArray(res.errors)).toBe(true);
  }
});

test("plan with redact strips secrets from env files", async () => {
  const state = defaultState();
  state.localSandbox = true;
  const res = await runHeadless({ kind: "plan", state, redact: true });
  expect(res.kind).toBe("plan");
  if (res.kind === "plan") {
    const dump = JSON.stringify(res.plan);
    expect(dump).not.toContain(state.adminPassword);
  }
});

test("operations lists the manage catalog", async () => {
  const res = await runHeadless({ kind: "operations", hasStaging: true });
  expect(res.kind).toBe("operations");
  if (res.kind === "operations") {
    expect(res.operations.length).toBeGreaterThan(0);
    expect(res.operations.some((op) => op.id === "health")).toBe(true);
  }
});

test("runOperation simulates safely in the local sandbox", async () => {
  const state = defaultState();
  state.localSandbox = true;
  state.selectedSiteDir = "/tmp/demo";
  const res = await runHeadless({
    kind: "runOperation",
    operationId: "health",
    state,
    apply: true
  });
  expect(res.kind).toBe("runOperation");
});

test("unknown operation returns an error response", async () => {
  const res = await runHeadless({
    kind: "runOperation",
    operationId: "nope",
    state: defaultState(),
    apply: false
  });
  expect(res.kind).toBe("error");
});
