export type TerminalLayoutKind = "wide" | "medium" | "compact" | "emergency";

export interface TerminalSize {
  height: number;
  width: number;
}

export interface TerminalSnapshotFixture extends TerminalSize {
  kind: TerminalLayoutKind;
  name: TerminalLayoutKind;
}

export const TERMINAL_SNAPSHOT_FIXTURES: TerminalSnapshotFixture[] = [
  { height: 40, kind: "wide", name: "wide", width: 120 },
  { height: 30, kind: "medium", name: "medium", width: 92 },
  { height: 24, kind: "compact", name: "compact", width: 80 },
  { height: 18, kind: "emergency", name: "emergency", width: 60 }
];

export function classifyTerminalLayout(
  size: TerminalSize,
  options: { forceCompact?: boolean } = {}
): { compact: boolean; kind: TerminalLayoutKind } {
  if (size.width < 70 || size.height < 20) {
    return { compact: true, kind: "emergency" };
  }
  if (options.forceCompact || size.width < 92 || size.height < 26) {
    return { compact: true, kind: "compact" };
  }
  if (size.width < 120 || size.height < 40) {
    return { compact: false, kind: "medium" };
  }
  return { compact: false, kind: "wide" };
}
