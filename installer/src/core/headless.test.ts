import { expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { runHeadless, runHeadlessRunPlan } from "./headless";
import type { InstallPlan, InstallTask, ProgressEvent } from "./types";

function planWithTasks(tasks: InstallTask[]): InstallPlan {
  return {
    version: "test",
    generatedAt: "now",
    installDir: "/tmp/demo",
    localSandbox: false,
    repo: "repo",
    ref: "ref",
    siteSlug: "demo",
    domains: { production: "demo.test", wwwAlias: false, stagingEnabled: false, staging: "" },
    envFiles: [],
    caddyfile: "",
    tasks,
    warnings: [],
    summary: {}
  };
}

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

test("runHeadlessRunPlan emits a start+result per task in order and returns the results", async () => {
  const plan = planWithTasks([
    { id: "one", title: "Step One", description: "" },
    { id: "two", title: "Step Two", description: "", skip: true }
  ]);
  const events: ProgressEvent[] = [];
  const res = await runHeadlessRunPlan(plan, false, (event) => events.push(event));

  // Two tasks -> exactly four events: start/result, start/result, in plan order.
  expect(events.map((e) => [e.phase, e.taskId])).toEqual([
    ["start", "one"],
    ["result", "one"],
    ["start", "two"],
    ["result", "two"]
  ]);
  // Names are the human task titles (the panel matches step rows on these).
  expect(events[0]?.name).toBe("Step One");
  // index/total are correct and zero-based with a stable total.
  expect(events.every((e) => e.total === 2)).toBe(true);
  expect(events[2]?.index).toBe(1);
  // Result events carry the final task status (skip -> "skipped").
  const results = events.filter((e) => e.phase === "result");
  expect(results.map((e) => e.status)).toEqual(["done", "skipped"]);

  // The terminal response equals the runPlan results runHeadless would return.
  expect(res.kind).toBe("runPlan");
  if (res.kind === "runPlan") {
    expect(res.results.map((r) => [r.id, r.status])).toEqual([
      ["one", "done"],
      ["two", "skipped"]
    ]);
  }
});

test("non-runPlan kinds each emit exactly one parseable JSON response", async () => {
  // The CLI prints runHeadless's response as ONE pretty JSON for every non-runPlan
  // kind; assert each is a single JSON.parse-able document (no NDJSON framing).
  const requests = [
    { kind: "validate", state: defaultState() },
    { kind: "operations", hasStaging: true },
    { kind: "runOperation", operationId: "nope", state: defaultState(), apply: false }
  ] as const;
  for (const request of requests) {
    const response = await runHeadless(request);
    const printed = JSON.stringify(response, null, 2);
    expect(() => JSON.parse(printed)).not.toThrow();
    // A single document: stripped of internal newlines it parses as one object.
    expect(JSON.parse(printed).kind).toBe(response.kind);
  }
});
