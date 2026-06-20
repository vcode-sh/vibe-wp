import { describe, expect, test } from "bun:test";
import { groupedOperations } from "../core/manage-operations";
import { flattenGroups, windowOpLines } from "./op-window";

const lines = flattenGroups(groupedOperations(true));

describe("windowOpLines", () => {
  test("returns everything when the list fits", () => {
    const result = windowOpLines(lines, "health", lines.length);
    expect(result.lines).toHaveLength(lines.length);
    expect(result.moreUp).toBe(0);
    expect(result.moreDown).toBe(0);
  });

  test("windows around the selection and never exceeds the row budget", () => {
    const result = windowOpLines(lines, "health", 6);
    expect(result.lines.length).toBeLessThanOrEqual(6);
    expect(result.lines.some((l) => l.kind === "op" && l.op.id === "health")).toBe(true);
    expect(result.moreUp).toBe(0);
    expect(result.moreDown).toBeGreaterThan(0);
  });

  test("keeps a deep selection visible with both markers", () => {
    const result = windowOpLines(lines, "stop", 6);
    expect(result.lines.some((l) => l.kind === "op" && l.op.id === "stop")).toBe(true);
    expect(result.moreUp).toBeGreaterThan(0);
  });

  test("shows the selected operation's group header for context", () => {
    const result = windowOpLines(lines, "restore", 5);
    expect(result.lines[0]?.kind).toBe("header");
  });

  test("hidden counts only count operations, not headers", () => {
    const opTotal = lines.filter((l) => l.kind === "op").length;
    const result = windowOpLines(lines, "health", 6);
    const shown = result.lines.filter((l) => l.kind === "op").length;
    expect(result.moreUp + shown + result.moreDown).toBe(opTotal);
  });
});
