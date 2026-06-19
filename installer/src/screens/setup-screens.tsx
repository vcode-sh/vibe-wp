import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { modeOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { InfoGrid, Metric } from "../components/data-display";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { NoteBox, Section } from "../components/section";
import type { InstallMode } from "../core/types";

export function WelcomeScreen({ state, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text attributes={TextAttributes.BOLD} fg={color("text")}>
        Welcome to Vibe WP
      </text>
      <text fg={color("muted")} wrapMode="word">
        A production WordPress installer that shows every important choice before it touches the
        server.
      </text>
      <Section title="Host">
        <Metric label="Host" tone="accent" value={state.host.osName} />
        <Metric
          label="Docker"
          tone={state.host.docker ? "success" : "warning"}
          value={state.host.docker ? "detected" : "missing"}
        />
        <Metric
          label="Caddy"
          tone={state.host.caddy ? "success" : "warning"}
          value={state.host.caddy ? "detected" : "missing"}
        />
      </Section>
      <NoteBox>
        <text fg={color("muted")} wrapMode="word">
          Prepares env files, Caddy HTTPS, Docker services, WordPress install, staging, backups,
          smoke checks, and performance reports. Nothing privileged runs until review — use
          --dry-run or --export-plan for a non-interactive audit.
        </text>
      </NoteBox>
      <ActionRow
        onPrimary={next}
        primary="Start guided install"
        secondary="Review every step first"
      />
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
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Section title="Host facts">
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
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => update("mode", value as InstallMode)}
        options={modeOptions}
        value={state.mode}
      />
      <Field
        focused={focusIndex === 1}
        label="Install directory"
        onInput={(value) => update("installDir", value)}
        value={state.installDir}
      />
      <Field
        focused={focusIndex === 2}
        label="Git ref"
        onInput={(value) => update("ref", value)}
        value={state.ref}
      />
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
