// Palette inspired by opencode: a stepped neutral ramp that builds depth through
// layered backgrounds (bg < panel < card < elevated) plus a warm peach accent.
export const theme = {
  bg: "#0a0a0a",
  panel: "#141414",
  panel2: "#181818",
  panel3: "#1e1e1e",
  elevated: "#242424",
  text: "#eeeeee",
  muted: "#9a9a9a",
  subtle: "#6e6e6e",
  accent: "#5c84ff",
  accentBar: "#4d7cff",
  accentText: "#ffffff",
  accent2: "#5c9cf5",
  success: "#7fd88f",
  warning: "#f5a742",
  danger: "#e06c75",
  border: "#2a2a2a",
  borderStrong: "#3c3c3c",
  black: "#0a0a0a",
  focusRing: "#4d7cff",
  activeStep: "#5c84ff",
  // Selection: a muted blue surface with a bright accent bar (t1code pattern).
  selectionBg: "#16264d",
  // Tone-tinted card surfaces for depth (t1code surfaceInfo/Warn/Plan).
  surfaceInfo: "#161d2e",
  surfaceSuccess: "#15231b",
  surfaceWarn: "#241f12",
  surfaceDanger: "#271819",
  divider: "#222222"
} as const;

export type ThemeColor = keyof typeof theme;

export function color(name: ThemeColor): string {
  return theme[name];
}
