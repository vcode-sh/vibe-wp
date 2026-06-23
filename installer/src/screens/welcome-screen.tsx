import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Banner } from "../components/banner";
import { Credits } from "../components/credits";
import { useGlyphs } from "../components/glyph-context";
import { ActionRow } from "../components/primitives";

const FEATURES = [
  "Nginx page cache",
  "Redis object cache",
  "Auto HTTPS",
  "Staging",
  "Backups",
  "Smoke tests"
];

export function WelcomeScreen({ state, update, next }: ScreenProps) {
  const siteCount = state.host.existingSites.length;
  const bare = siteCount === 0 && !state.host.docker && !state.host.caddy;

  function ctaLabel(): string {
    if (siteCount > 0) {
      return "Open control panel";
    }
    if (bare) {
      return "Set up your control panel";
    }
    return "Start guided install";
  }

  function subtitleText(): string {
    if (siteCount > 0) {
      return `${siteCount} site(s) on this server — open the panel to manage them or add another.`;
    }
    if (bare) {
      return "Bare server detected — we'll install Docker, Caddy and the control panel for you.";
    }
    return "Before you start: have a domain ready and pointed at this server's IP.";
  }

  function handlePrimary() {
    if (bare) {
      update("mode", "panel-bootstrap");
    }
    next();
  }

  return (
    <box alignItems="center" flexDirection="column" flexGrow={1} gap={1} justifyContent="center">
      <Banner />
      <text fg={color("muted")}>
        Install and manage WordPress on Docker — your VPS control panel.
      </text>
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
      <text fg={color("subtle")}>{subtitleText()}</text>
      <box paddingY={1}>
        <ActionRow
          onPrimary={handlePrimary}
          primary={ctaLabel()}
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
  // One wrapping line so it never overflows narrow / SSH terminals.
  return (
    <text fg={color("muted")} wrapMode="word">
      {FEATURES.join(`   ${glyphs.bullet} `)}
    </text>
  );
}
