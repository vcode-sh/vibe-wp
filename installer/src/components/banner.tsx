import { TextAttributes } from "@opentui/core";
import { color } from "../app/theme";
import { useAscii } from "./glyph-context";

// ANSI-shadow wordmark for "VIBE WP"; falls back to a simple spaced title.
const ART = [
  "██╗   ██╗██╗██████╗ ███████╗   ██╗    ██╗██████╗ ",
  "██║   ██║██║██╔══██╗██╔════╝   ██║    ██║██╔══██╗",
  "██║   ██║██║██████╔╝█████╗     ██║ █╗ ██║██████╔╝",
  "╚██╗ ██╔╝██║██╔══██╗██╔══╝     ██║███╗██║██╔═══╝ ",
  " ╚████╔╝ ██║██████╔╝███████╗   ╚███╔███╔╝██║     ",
  "  ╚═══╝  ╚═╝╚═════╝ ╚══════╝    ╚══╝╚══╝ ╚═╝     "
];

export function Banner() {
  const ascii = useAscii();
  if (ascii) {
    return (
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        V I B E · W P
      </text>
    );
  }
  return (
    <box alignItems="center" flexDirection="column">
      {ART.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static banner art
        <text fg={color("accent")} height={1} key={index}>
          {line}
        </text>
      ))}
    </box>
  );
}
