import { expect, test } from "bun:test";
import { resolveGlyphs, shouldUseAscii, spinnerFrames } from "./glyphs";

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

test("unicode glyphs by default", () => {
  expect(resolveGlyphs(false).done).toBe("✓");
});

test("ascii fallback swaps every glyph to ascii-safe", () => {
  const g = resolveGlyphs(true);
  for (const v of Object.values(g)) {
    expect(PRINTABLE_ASCII.test(v)).toBe(true);
  }
});

test("shouldUseAscii honors explicit flag", () => {
  expect(shouldUseAscii({ ascii: true, env: { LANG: "en_US.UTF-8" } })).toBe(true);
});

test("shouldUseAscii defaults ascii for non-utf8 locale", () => {
  expect(shouldUseAscii({ ascii: false, env: { LANG: "C" } })).toBe(true);
  expect(shouldUseAscii({ ascii: false, env: { LANG: "en_US.UTF-8" } })).toBe(false);
});

test("spinner frames differ by mode", () => {
  expect(spinnerFrames(false).length).toBeGreaterThan(1);
  expect(spinnerFrames(true)).toContain("/");
});
