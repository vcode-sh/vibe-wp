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

export function NoteBox({
  children,
  tone = "border"
}: {
  children: ReactNode;
  tone?: "border" | "success" | "danger";
}) {
  return (
    <box
      backgroundColor={color("panel3")}
      borderColor={color(tone === "border" ? "divider" : tone)}
      borderStyle={BORDER.frame}
      flexDirection="column"
      gap={space.xs}
      padding={space.sm}
    >
      {children}
    </box>
  );
}
