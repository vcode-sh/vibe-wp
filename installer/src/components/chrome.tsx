import { TextAttributes } from "@opentui/core";
import type { StepKind } from "../app/nav-hints";
import type { Step } from "../app/steps";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";
import { INSTALLER_VERSION } from "../core/defaults";
import type { InstallerState } from "../core/types";
import { Credits } from "./credits";
import { useGlyphs } from "./glyph-context";
import type { GlyphName } from "./glyphs";
import { KeyHints } from "./keycap";

export function Header() {
  const glyphs = useGlyphs();
  return (
    <box
      alignItems="center"
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="row"
      height={3}
      justifyContent="space-between"
      paddingX={1}
    >
      <box alignItems="center" flexDirection="row" gap={space.sm}>
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {glyphs.wordmark} VIBE WP
        </text>
        <text fg={color("subtle")} truncate>
          Managed WordPress on Docker, tuned for VPS production.
        </text>
      </box>
      <text fg={color("muted")}>v{INSTALLER_VERSION}</text>
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
  const glyphs = useGlyphs();
  return (
    <box
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      gap={space.sm}
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
          {glyphs.warn} {warning}
        </text>
      ))}
      <box border={["top"]} borderColor={color("divider")} flexDirection="column" paddingTop={1}>
        <Credits layout="column" />
      </box>
    </box>
  );
}

export function LogStrip({ lines }: { lines: string[] }) {
  return (
    <box
      backgroundColor={color("panel")}
      border={["top"]}
      borderColor={color("divider")}
      flexDirection="column"
      height={5}
      paddingX={1}
    >
      <text attributes={TextAttributes.BOLD} fg={color("muted")}>
        LOG
      </text>
      <text fg={color("subtle")} truncate>
        {lines.slice(-3).join("  ·  ")}
      </text>
    </box>
  );
}

export function Footer({
  currentIndex,
  total,
  validationCount,
  kind
}: {
  currentIndex: number;
  total: number;
  validationCount: number;
  kind: StepKind;
}) {
  const glyphs = useGlyphs();
  const hints = footerHints(kind, glyphs);
  return (
    <box
      alignItems="center"
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="row"
      height={3}
      justifyContent="space-between"
      paddingX={1}
    >
      <KeyHints hints={hints} />
      <box alignItems="center" flexDirection="row" gap={space.md}>
        {validationCount > 0 ? (
          <box backgroundColor={color("warning")} paddingX={1}>
            <text attributes={TextAttributes.BOLD} fg={color("black")}>
              {validationCount} {glyphs.warn}
            </text>
          </box>
        ) : (
          <text fg={color("success")}>{glyphs.done} valid</text>
        )}
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {currentIndex + 1}/{total}
        </text>
      </box>
    </box>
  );
}

interface Hint {
  key: string;
  label: string;
}

// Context-aware footer: lead with the keys that actually do something on THIS
// screen, then the universal nav keys. Fixes "I don't know how to select."
function footerHints(kind: StepKind, glyphs: Record<GlyphName, string>): Hint[] {
  const input: Hint[] = [];
  if (kind === "choice") {
    input.push({ key: glyphs.arrows, label: "choose" });
  } else if (kind === "toggles") {
    input.push({ key: glyphs.arrows, label: "move" }, { key: "space", label: "toggle" });
  } else if (kind === "fields") {
    input.push({ key: "type", label: "edit" }, { key: glyphs.arrows, label: "move" });
  } else if (kind === "mixed") {
    input.push({ key: glyphs.arrows, label: "move" }, { key: "space", label: "toggle" });
  }
  const tail: Hint[] = [
    { key: glyphs.enter, label: kind === "done" ? "finish" : "continue" },
    { key: "esc", label: "back" },
    { key: "?", label: "help" }
  ];
  return [...input, ...tail];
}
