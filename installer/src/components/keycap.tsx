import type { ReactNode } from "react";
import { color } from "../app/theme";
import { space } from "../app/tokens";

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <box backgroundColor={color("panel3")} paddingX={1}>
      <text fg={color("text")}>{children}</text>
    </box>
  );
}

export function KeyHints({ hints }: { hints: Array<{ key: string; label: string }> }) {
  return (
    <box flexDirection="row" gap={space.md}>
      {hints.map((hint) => (
        <box flexDirection="row" gap={space.sm} key={`${hint.key}-${hint.label}`}>
          <KeyCap>{hint.key}</KeyCap>
          <text fg={color("muted")}>{hint.label}</text>
        </box>
      ))}
    </box>
  );
}
