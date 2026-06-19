import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "./glyph-context";

type MetricTone = "accent" | "success" | "warning";

export function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: MetricTone;
}) {
  const glyphs = useGlyphs();
  const marker = tone === "success" ? glyphs.ok : tone === "warning" ? glyphs.missing : glyphs.bullet;
  return (
    <box alignItems="center" flexDirection="row" flexGrow={1} gap={space.sm} paddingX={1}>
      <text fg={color(tone)}>{marker}</text>
      <text fg={color("muted")}>{label}</text>
      <text fg={color("text")} truncate>
        {value}
      </text>
    </box>
  );
}

export function InfoGrid({ rows }: { rows: [string, string][] }) {
  return (
    <box
      border={["left"]}
      borderColor={color("accent")}
      flexDirection="column"
      gap={space.xs}
      paddingX={1}
    >
      {rows.map(([label, value]) => (
        <box flexDirection="row" gap={space.md} justifyContent="space-between" key={label}>
          <text fg={color("muted")} truncate>
            {label}
          </text>
          <text fg={color("text")} truncate>
            {value}
          </text>
        </box>
      ))}
    </box>
  );
}
