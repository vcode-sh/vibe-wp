import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Banner } from "../components/banner";
import { Credits } from "../components/credits";
import { useGlyphs } from "../components/glyph-context";
import { ActionRow } from "../components/primitives";

const FEATURES = [
  "Nginx FastCGI cache",
  "Redis object cache",
  "Auto HTTPS",
  "Staging",
  "Backups",
  "Smoke tests"
];

export function WelcomeScreen({ state, next }: ScreenProps) {
  return (
    <box alignItems="center" flexDirection="column" flexGrow={1} gap={1} justifyContent="center">
      <Banner />
      <text fg={color("muted")}>Managed WordPress on Docker, tuned for VPS production.</text>
      <box flexDirection="row" gap={2} paddingY={1}>
        <ReadyChip label="Host" tone="accent" value={state.host.osName} />
        <ReadyChip
          label="Docker"
          tone={state.host.docker ? "success" : "warning"}
          value={state.host.docker ? "detected" : "missing"}
        />
        <ReadyChip
          label="Caddy"
          tone={state.host.caddy ? "success" : "warning"}
          value={state.host.caddy ? "detected" : "missing"}
        />
      </box>
      <FeatureStrip />
      <text fg={color("subtle")}>
        Before you start: have a domain ready and pointed at this server's IP.
      </text>
      <box paddingY={1}>
        <ActionRow
          onPrimary={next}
          primary="Start guided install"
          secondary="Nothing privileged runs until review"
        />
      </box>
      <Credits />
    </box>
  );
}

function ReadyChip({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "accent" | "success" | "warning";
}) {
  const glyphs = useGlyphs();
  return (
    <box
      alignItems="center"
      backgroundColor={color("panel3")}
      flexDirection="row"
      gap={1}
      height={1}
      paddingX={2}
    >
      <text fg={color(tone)}>{tone === "success" ? glyphs.ok : glyphs.bullet}</text>
      <text attributes={TextAttributes.BOLD} fg={color("text")}>
        {label}
      </text>
      <text fg={color("muted")} truncate>
        {value}
      </text>
    </box>
  );
}

function FeatureStrip() {
  const glyphs = useGlyphs();
  return (
    <box alignItems="center" flexDirection="row" gap={2}>
      {FEATURES.map((feature) => (
        <box flexDirection="row" gap={1} key={feature}>
          <text fg={color("accent")}>{glyphs.bullet}</text>
          <text fg={color("muted")}>{feature}</text>
        </box>
      ))}
    </box>
  );
}
