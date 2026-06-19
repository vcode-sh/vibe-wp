import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <box flexDirection="column" gap={space.sm}>
      <box border={["bottom"]} borderColor={color("divider")} flexDirection="row">
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {title}
        </text>
      </box>
      {children}
    </box>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <box
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      padding={space.sm}
    >
      {children}
    </box>
  );
}
