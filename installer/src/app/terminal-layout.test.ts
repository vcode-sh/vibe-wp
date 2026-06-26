import { describe, expect, it } from "bun:test";
import { classifyTerminalLayout, TERMINAL_SNAPSHOT_FIXTURES } from "./terminal-layout";

describe("terminal layout snapshot fixtures", () => {
  it("covers the release-check terminal sizes", () => {
    expect(TERMINAL_SNAPSHOT_FIXTURES).toEqual([
      { height: 40, kind: "wide", name: "wide", width: 120 },
      { height: 30, kind: "medium", name: "medium", width: 92 },
      { height: 24, kind: "compact", name: "compact", width: 80 },
      { height: 18, kind: "emergency", name: "emergency", width: 60 }
    ]);
  });

  it("classifies the fixtures consistently", () => {
    for (const fixture of TERMINAL_SNAPSHOT_FIXTURES) {
      expect(classifyTerminalLayout(fixture)).toEqual({
        compact: fixture.kind !== "wide" && fixture.kind !== "medium",
        kind: fixture.kind
      });
    }
  });

  it("respects forced compact mode without hiding emergency terminals", () => {
    expect(classifyTerminalLayout({ height: 40, width: 120 }, { forceCompact: true })).toEqual({
      compact: true,
      kind: "compact"
    });
    expect(classifyTerminalLayout({ height: 18, width: 60 }, { forceCompact: true })).toEqual({
      compact: true,
      kind: "emergency"
    });
  });
});
