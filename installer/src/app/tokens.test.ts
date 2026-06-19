import { expect, test } from "bun:test";
import { clampContentWidth, CONTENT_MAX_WIDTH } from "./tokens";

test("clampContentWidth caps wide terminals", () => {
  expect(clampContentWidth(300)).toBe(CONTENT_MAX_WIDTH);
});

test("clampContentWidth keeps narrow widths", () => {
  expect(clampContentWidth(60)).toBe(60);
});
