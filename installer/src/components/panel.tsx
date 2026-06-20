import { TextAttributes } from "@opentui/core";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";

export function Panel({
  title,
  content,
  maxLines = 10
}: {
  title: string;
  content: string;
  maxLines?: number;
}) {
  const allLines = (content || "None").split("\n");
  const lines = allLines.slice(0, maxLines);
  const overflow = allLines.length - lines.length;
  return (
    <box
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      padding={space.sm}
    >
      <box border={["bottom"]} borderColor={color("divider")} flexDirection="row" height={2}>
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {title}
        </text>
      </box>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: preview lines are positional
        <text fg={color("text")} height={1} key={`${title}-${index}`} truncate>
          {line}
        </text>
      ))}
      {overflow > 0 && (
        <text fg={color("subtle")} height={1}>
          … +{overflow} more
        </text>
      )}
    </box>
  );
}
