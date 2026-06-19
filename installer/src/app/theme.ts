export const theme = {
  bg: "#090B0F",
  panel: "#101318",
  panel2: "#151A21",
  panel3: "#1B212A",
  text: "#E6E8EB",
  muted: "#A1A7B3",
  subtle: "#6F7785",
  accent: "#8EA4FF",
  accent2: "#7DD3C7",
  success: "#6EE7B7",
  warning: "#F6C177",
  danger: "#FCA5A5",
  border: "#252B35",
  borderStrong: "#4C5A70",
  black: "#020617",
  focusRing: "#8EA4FF",
  activeStep: "#8EA4FF",
  selectionBg: "#1A2133",
  divider: "#1C222B"
} as const;

export type ThemeColor = keyof typeof theme;

export function color(name: ThemeColor): string {
  return theme[name];
}
