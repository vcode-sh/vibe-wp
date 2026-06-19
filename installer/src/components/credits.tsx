import { color } from "../app/theme";
import { space } from "../app/tokens";
import { credits } from "../core/credits";
import { useGlyphs } from "./glyph-context";

// Single-line author/repo credits. `layout="row"` for the Welcome footer,
// `layout="column"` for the context panel.
export function Credits({ layout = "row" }: { layout?: "row" | "column" }) {
  const glyphs = useGlyphs();
  const items = [`Built by ${credits.author}`, credits.github, credits.x];
  if (layout === "column") {
    return (
      <box flexDirection="column">
        {items.map((item) => (
          <text fg={color("subtle")} key={item} truncate>
            {item}
          </text>
        ))}
      </box>
    );
  }
  return (
    <box flexDirection="row" gap={space.sm}>
      {items.map((item, index) => (
        <box flexDirection="row" gap={space.sm} key={item}>
          {index > 0 && <text fg={color("divider")}>{glyphs.bullet}</text>}
          <text fg={color("subtle")}>{item}</text>
        </box>
      ))}
    </box>
  );
}
