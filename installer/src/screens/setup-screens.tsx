import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Banner } from "../components/banner";
import { Credits } from "../components/credits";
import { InfoGrid } from "../components/data-display";
import { useGlyphs } from "../components/glyph-context";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { Section } from "../components/section";
import { checkEmail } from "../core/field-checks";

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

export function SystemScreen({ state, update, focusIndex, next }: ScreenProps) {
  const rows: [string, string][] = [
    ["OS", state.host.osName],
    ["Kernel", state.host.kernel],
    ["Architecture", state.host.arch],
    ["User", `${state.host.user}${state.host.sudo ? " with sudo/root" : ""}`],
    ["Memory", state.host.totalMemoryMb ? `${state.host.totalMemoryMb} MB` : "unknown"],
    ["CPU", state.host.cpuCount ? `${state.host.cpuCount} cores` : "unknown"],
    ["Public IP", state.host.publicIp ?? "not detected"],
    ["Docker", state.host.docker ?? "missing"],
    ["Compose", state.host.compose ?? "missing"],
    ["Caddy", state.host.caddy ?? "missing"]
  ];
  const missing = [state.host.docker ? null : "Docker", state.host.caddy ? null : "Caddy"].filter(
    Boolean
  );
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={missing.length ? color("warning") : color("success")} wrapMode="word">
        {missing.length
          ? `Your server is missing ${missing.join(" and ")} — the building blocks Vibe WP runs on. Leave the switches below ON and we'll install them for you.`
          : "Your server already has everything Vibe WP needs."}
      </text>
      <Section title="Your server">
        <InfoGrid rows={rows} />
      </Section>
      <ToggleRow
        focused={focusIndex === 0}
        label="Install Docker if missing"
        onToggle={() => update("installDocker", !state.installDocker)}
        value={state.installDocker}
      />
      <ToggleRow
        focused={focusIndex === 1}
        label="Install Caddy if missing"
        onToggle={() => update("installCaddy", !state.installCaddy)}
        value={state.installCaddy}
      />
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Host changes stay pending until review"
      />
    </box>
  );
}

export function ModeScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Section title="Checkout location">
        <Field
          focused={focusIndex === 0}
          label="Install directory"
          onInput={(value) => update("installDir", value)}
          value={state.installDir}
        />
        <Field
          focused={focusIndex === 1}
          label="Git ref"
          onInput={(value) => update("ref", value)}
          value={state.ref}
        />
      </Section>
      <text fg={color("muted")}>
        Defaults are derived from your domain — change only if needed.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="The checkout is backed by the existing Vibe WP repo"
      />
    </box>
  );
}

export function AdminScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Field
        focused={focusIndex === 0}
        label="Site title"
        onInput={(value) => update("siteTitle", value)}
        value={state.siteTitle}
      />
      <Field
        focused={focusIndex === 1}
        label="Admin username"
        onInput={(value) => update("adminUser", value)}
        value={state.adminUser}
      />
      <Field
        feedback={checkEmail(state.adminEmail)}
        focused={focusIndex === 2}
        label="Admin email"
        onInput={(value) => update("adminEmail", value)}
        value={state.adminEmail}
      />
      <Field
        focused={focusIndex === 3}
        label="Admin password"
        onInput={(value) => update("adminPassword", value)}
        secret
        value={state.adminPassword}
      />
      <Field
        focused={focusIndex === 4}
        label="Locale"
        onInput={(value) => update("locale", value)}
        value={state.locale}
      />
      <text fg={color("muted")}>
        Password is stored only in the generated env file and redacted from logs.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Use WordPress admin to change profile details later"
      />
    </box>
  );
}
