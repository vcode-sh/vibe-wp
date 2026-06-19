import { expect, test } from "bun:test";
import { visibleSteps } from "./flow";

test("new-site reveals the full build flow", () => {
  const ids = visibleSteps("new-site").map((step) => step.id);
  expect(ids).toContain("domain");
  expect(ids).toContain("admin");
  expect(ids).toContain("staging");
  expect(ids.length).toBe(13);
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
