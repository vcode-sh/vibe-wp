import { TextAttributes } from "@opentui/core";
import type { StepKind } from "../app/nav-hints";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";
import { INSTALLER_VERSION } from "../core/defaults";
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
  kind,
  focusCount
}: {
  currentIndex: number;
  total: number;
  validationCount: number;
  kind: StepKind;
  focusCount: number;
}) {
  const glyphs = useGlyphs();
  const hints = footerHints(kind, focusCount, glyphs);
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
function footerHints(
  kind: StepKind,
  focusCount: number,
  glyphs: Record<GlyphName, string>
): Hint[] {
  // Tab switches between controls — surface it whenever a screen has more than
  // one, so users don't get stuck on the first field/list.
  const multi = focusCount > 1;
  const tab: Hint[] = multi ? [{ key: glyphs.tab, label: "switch" }] : [];
  const input: Hint[] = [];
  if (kind === "choice") {
    input.push({ key: glyphs.arrows, label: "choose" }, ...tab);
  } else if (kind === "toggles") {
    input.push(...tab, { key: "space", label: "toggle" });
  } else if (kind === "fields") {
    input.push(...tab, { key: "type", label: "edit" });
  } else if (kind === "mixed") {
    input.push(...tab, { key: "space", label: "toggle" });
  }
  // On field/mixed screens "?" types into the focused input, so F1 is the help
  // key there; elsewhere "?" is fine and more discoverable.
  const helpKey = kind === "fields" || kind === "mixed" ? "F1" : "?";
  const tail: Hint[] = [
    { key: glyphs.enter, label: kind === "done" ? "finish" : "continue" },
    { key: "esc", label: "back" },
    { key: helpKey, label: "help" }
  ];
  return [...input, ...tail];
}
