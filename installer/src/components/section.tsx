import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { color, type ThemeColor } from "../app/theme";
import { BORDER, space } from "../app/tokens";

type NoteTone = "border" | "info" | "success" | "danger";

const NOTE_SURFACE: Record<NoteTone, ThemeColor> = {
  border: "panel3",
  info: "surfaceInfo",
  success: "surfaceSuccess",
  danger: "surfaceDanger"
};

const NOTE_BORDER: Record<NoteTone, ThemeColor> = {
  border: "divider",
  info: "accent",
  success: "success",
  danger: "danger"
};

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

export function NoteBox({ children, tone = "border" }: { children: ReactNode; tone?: NoteTone }) {
  return (
    <box
      backgroundColor={color(NOTE_SURFACE[tone])}
      borderColor={color(NOTE_BORDER[tone])}
      borderStyle={BORDER.frame}
      flexDirection="column"
      gap={space.xs}
      padding={space.sm}
    >
      {children}
    </box>
  );
}
