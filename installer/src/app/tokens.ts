export const CONTENT_MAX_WIDTH = 84;
export const RAIL_WIDTH = 22;

export const space = { xs: 0, sm: 1, md: 2 } as const;

// Border style literals consumed by OpenTUI box `borderStyle`.
export const BORDER = {
  frame: "rounded",
  inset: "single"
} as const;

export function clampContentWidth(available: number): number {
  return Math.min(available, CONTENT_MAX_WIDTH);
}
