import { TextAttributes } from "@opentui/core";
import type { Step } from "../app/steps";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";
import type { InstallerState } from "../core/types";
import { Credits } from "./credits";
import { useGlyphs } from "./glyph-context";

export function HelpPanel({
  current,
  state,
  warnings,
  compact = false
}: {
  current: Step;
  state: InstallerState;
  warnings: string[];
  compact?: boolean;
}) {
  const glyphs = useGlyphs();
  return (
    <box
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={compact ? 1 : undefined}
      gap={space.sm}
      padding={1}
      width={compact ? undefined : 32}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {current.title.toUpperCase()} · HELP
        </text>
        {compact && <text fg={color("subtle")}>esc to close</text>}
      </box>
      {/* Scrollable body so help never overdraws when short; focused in compact
          so ↑/↓ scroll it (the form behind is hidden, so there's no conflict). */}
      <scrollbox flexGrow={1} focused={compact} scrollX={false} scrollY={true}>
        <box flexDirection="column" gap={compact ? 0 : space.sm}>
          <text fg={color("text")} wrapMode="word">
            {current.help}
          </text>
          {!compact && (
            <>
              <text fg={color("muted")}>Production</text>
              <text fg={color("text")} truncate>
                https://{state.productionDomain}
              </text>
              <text fg={color("muted")}>Staging</text>
              <text fg={state.stagingEnabled ? color("text") : color("subtle")} truncate>
                {state.stagingEnabled ? `https://${state.stagingDomain}` : "disabled"}
              </text>
            </>
          )}
          {(!compact || warnings.length > 0) && (
            <text fg={warnings.length ? color("warning") : color("success")}>
              {warnings.length ? `${warnings.length} warning(s)` : "No warnings"}
            </text>
          )}
          {warnings.slice(0, compact ? 2 : 4).map((warning) => (
            <text fg={color("warning")} key={warning} wrapMode="word">
              {glyphs.warn} {warning}
            </text>
          ))}
          <box
            border={["top"]}
            borderColor={color("divider")}
            flexDirection="column"
            paddingTop={1}
          >
            <text attributes={TextAttributes.BOLD} fg={color("accent")}>
              KEYS
            </text>
            {KEY_HELP.map(([k, v]) => (
              <box flexDirection="row" gap={space.sm} key={k}>
                <text fg={color("text")} width={13}>
                  {k}
                </text>
                <text fg={color("muted")} truncate>
                  {v}
                </text>
              </box>
            ))}
          </box>
          {!compact && (
            <box
              border={["top"]}
              borderColor={color("divider")}
              flexDirection="column"
              paddingTop={1}
            >
              <Credits layout="column" />
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}

const KEY_HELP: [string, string][] = [
  ["arrows / 1-9", "choose an option"],
  ["Tab", "switch field"],
  ["space", "toggle on/off"],
  ["Enter", "continue"],
  ["Esc", "go back"],
  ["F1 / ?", "help · Ctrl+L logs"]
];
