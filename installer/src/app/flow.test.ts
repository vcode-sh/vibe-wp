import { expect, test } from "bun:test";
import { visibleSteps } from "./flow";

test("custom new-site reveals the full build flow", () => {
  const ids = visibleSteps("new-site", false).map((step) => step.id);
  expect(ids).toContain("domain");
  expect(ids).toContain("admin");
  expect(ids).toContain("staging");
  expect(ids.length).toBe(13);
});

test("custom new-site orders essentials before options and advanced last", () => {
  const ids = visibleSteps("new-site", false).map((step) => step.id);
  expect(ids).toEqual([
    "welcome",
    "sites",
    "system",
    "domain",
    "admin",
    "staging",
    "performance",
    "backup",
    "ai",
    "mode",
    "review",
    "execute",
    "success"
  ]);
});

test("quick new-site asks only the essentials", () => {
  const ids = visibleSteps("new-site", true).map((step) => step.id);
  expect(ids).toEqual(["welcome", "sites", "domain", "admin", "review", "execute", "success"]);
  expect(ids.length).toBe(7);
});

test("quick flag is ignored for non-new-site modes", () => {
  const ids = visibleSteps("staging-only", true).map((step) => step.id);
  expect(ids).toEqual([
    "welcome",
    "sites",
    "system",
    "domain",
    "staging",
    "review",
    "execute",
    "success"
  ]);
});

test("manage-existing routes to the dashboard", () => {
  const ids = visibleSteps("manage-existing").map((step) => step.id);
  expect(ids).toEqual(["welcome", "sites", "dashboard"]);
});

test("remove-existing skips all config steps", () => {
  const ids = visibleSteps("remove-existing").map((step) => step.id);
  expect(ids).not.toContain("admin");
  expect(ids).not.toContain("domain");
});

test("staging-only keeps domain and staging but drops admin", () => {
  const ids = visibleSteps("staging-only").map((step) => step.id);
  expect(ids).toContain("domain");
  expect(ids).toContain("staging");
  expect(ids).not.toContain("admin");
});

test("install flows start at welcome and end at success", () => {
  for (const mode of ["new-site", "staging-only", "update-existing", "remove-existing"] as const) {
    const ids = visibleSteps(mode).map((step) => step.id);
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("success");
  }
});
