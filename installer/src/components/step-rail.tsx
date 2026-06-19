import { TextAttributes } from "@opentui/core";
import { steps } from "../app/steps";
import { color } from "../app/theme";
import { BORDER, RAIL_WIDTH, space } from "../app/tokens";
import { useGlyphs } from "./glyph-context";
import type { GlyphName } from "./glyphs";

export function StepRail({ activeIndex }: { activeIndex: number }) {
  const glyphs = useGlyphs();
  return (
    <box
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      gap={space.xs}
      padding={1}
      width={RAIL_WIDTH}
    >
      <text attributes={TextAttributes.BOLD} fg={color("subtle")}>
        WORKFLOW
      </text>
      {steps.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const marker = stepMarker(glyphs, done, active);
        return (
          <box
            backgroundColor={active ? color("selectionBg") : undefined}
            flexDirection="row"
            gap={space.sm}
            key={step.id}
            paddingX={1}
          >
            <text fg={stepMarkerColor(done, active)}>{marker}</text>
            <text
              attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
              fg={stepTitleColor(done, active)}
              truncate
            >
              {step.title}
            </text>
          </box>
        );
      })}
    </box>
  );
}

export function CompactStepper({ activeIndex }: { activeIndex: number }) {
  const glyphs = useGlyphs();
  const dots = steps.map((step, index) => (
    <text fg={index <= activeIndex ? color("accent") : color("subtle")} key={step.id}>
      {index <= activeIndex ? glyphs.ok : glyphs.pending}
    </text>
  ));
  return (
    <box alignItems="center" flexDirection="row" gap={space.sm} paddingX={1}>
      {dots}
      <text fg={color("muted")}>
        Step {activeIndex + 1}/{steps.length}
      </text>
    </box>
  );
}

function stepMarker(glyphs: Record<GlyphName, string>, done: boolean, active: boolean): string {
  if (done) {
    return glyphs.done;
  }
  if (active) {
    return glyphs.active;
  }
  return glyphs.pending;
}

function stepMarkerColor(done: boolean, active: boolean): string {
  if (done) {
    return color("success");
  }
  if (active) {
    return color("accent");
  }
  return color("subtle");
}

function stepTitleColor(done: boolean, active: boolean): string {
  if (active) {
    return color("text");
  }
  return color(done ? "muted" : "subtle");
}
