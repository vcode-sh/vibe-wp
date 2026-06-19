import { expect, test } from "bun:test";
import { CONTENT_MAX_WIDTH, clampContentWidth } from "./tokens";

test("clampContentWidth caps wide terminals", () => {
  expect(clampContentWidth(300)).toBe(CONTENT_MAX_WIDTH);
});

test("clampContentWidth keeps narrow widths", () => {
  expect(clampContentWidth(60)).toBe(60);
});
