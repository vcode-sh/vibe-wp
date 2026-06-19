import { TextAttributes } from "@opentui/core";
import type { Step } from "../app/steps";
import { steps } from "../app/steps";
import { color } from "../app/theme";
import { INSTALLER_VERSION } from "../core/defaults";
import type { InstallerState } from "../core/types";

export function Header({
  compact,
  dimensions
}: {
  compact: boolean;
  dimensions: { width: number; height: number };
}) {
  return (
    <box
      alignItems="center"
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      height={compact ? 4 : 6}
      justifyContent="space-between"
      paddingX={1}
    >
      <box alignItems="center" flexDirection="row" gap={2}>
        {!compact && <ascii-font font="tiny" text="Vibe WP" />}
        <box flexDirection="column">
          <text attributes={TextAttributes.BOLD} fg={color("text")}>
            Vibe WP Installer
          </text>
          <text fg={color("muted")} truncate>
            Managed WordPress on Docker, tuned for VPS production.
          </text>
        </box>
      </box>
      <box alignItems="flex-end" flexDirection="column">
        <text fg={color("accent")}>v{INSTALLER_VERSION}</text>
        <text fg={color("subtle")}>
          {dimensions.width}x{dimensions.height}
        </text>
      </box>
    </box>
  );
}

export function StepRail({ activeIndex }: { activeIndex: number }) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      gap={1}
      padding={1}
      width={22}
    >
      <text attributes={TextAttributes.BOLD} fg={color("muted")}>
        FLOW
      </text>
      {steps.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const marker = stepMarker(done, active);
        const markerColor = stepMarkerColor(done, active);
        return (
          <box flexDirection="row" gap={1} key={step.id}>
            <text fg={markerColor}>{marker}</text>
            <text fg={active ? color("text") : color("muted")} truncate>
              {step.title}
            </text>
          </box>
        );
      })}
    </box>
  );
}

export function HelpPanel({
  current,
  state,
  warnings
}: {
  current: Step;
  state: InstallerState;
  warnings: string[];
}) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      gap={1}
      padding={1}
      width={32}
    >
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        CONTEXT
      </text>
      <text fg={color("text")} wrapMode="word">
        {current.help}
      </text>
      <text fg={color("muted")}>Production</text>
      <text fg={color("text")} truncate>
        https://{state.productionDomain}
      </text>
      <text fg={color("muted")}>Staging</text>
      <text fg={state.stagingEnabled ? color("text") : color("subtle")} truncate>
        {state.stagingEnabled ? `https://${state.stagingDomain}` : "disabled"}
      </text>
      <text fg={warnings.length ? color("warning") : color("success")}>
        {warnings.length ? `${warnings.length} warning(s)` : "No warnings"}
      </text>
      {warnings.slice(0, 4).map((warning) => (
        <text fg={color("warning")} key={warning} wrapMode="word">
          - {warning}
        </text>
      ))}
    </box>
  );
}

export function LogStrip({ lines }: { lines: string[] }) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      height={5}
      paddingX={1}
    >
      <text fg={color("accent")}>LOG</text>
      <text fg={color("muted")} truncate>
        {lines.slice(-3).join(" | ")}
      </text>
    </box>
  );
}

export function Footer({
  currentIndex,
  total,
  validationCount
}: {
  currentIndex: number;
  total: number;
  validationCount: number;
}) {
  return (
    <box
      alignItems="center"
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="row"
      height={3}
      justifyContent="space-between"
      paddingX={1}
    >
      <text fg={color("muted")}>Esc Back - Enter Continue - Ctrl+C Quit</text>
      <text fg={validationCount ? color("warning") : color("success")}>
        {validationCount ? `${validationCount} issue(s)` : "valid"}
      </text>
      <text fg={color("accent")}>
        Step {currentIndex + 1}/{total}
      </text>
    </box>
  );
}

function stepMarker(done: boolean, active: boolean): string {
  if (done) {
    return "*";
  }
  if (active) {
    return ">";
  }
  return "-";
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
