export const CONTENT_MAX_WIDTH = 84;
export const RAIL_WIDTH = 22;

// The currently focused control tags its box with this id so the content
// viewport can scroll it into view on short terminals.
export const FOCUS_ID = "vibe-focused-control";

export const space = { xs: 0, sm: 1, md: 2 } as const;

// Border style literal consumed by OpenTUI box `borderStyle`.
export const BORDER = {
  frame: "rounded"
} as const;
