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
  focusRing: "#3858e9",
  activeStep: "#3858e9",
  selectionBg: "#242424",
  divider: "#222222"
} as const;

export type ThemeColor = keyof typeof theme;

export function color(name: ThemeColor): string {
  return theme[name];
}
