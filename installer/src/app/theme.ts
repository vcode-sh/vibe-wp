export const theme = {
  bg: "#0B0F14",
  panel: "#111827",
  panel2: "#16202D",
  panel3: "#1B2635",
  text: "#E5E7EB",
  muted: "#94A3B8",
  subtle: "#64748B",
  accent: "#38BDF8",
  accent2: "#A78BFA",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  border: "#273244",
  borderStrong: "#3B82F6",
  black: "#020617"
} as const;

export type ThemeColor = keyof typeof theme;

export function color(name: ThemeColor): string {
  return theme[name];
}
