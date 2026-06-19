import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { modeOptions } from "../app/steps";
import { color } from "../app/theme";
import { ActionRow, Field, InfoGrid, Metric, ToggleRow } from "../components/primitives";
import type { InstallMode } from "../core/types";

export function WelcomeScreen({ state, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        A production WordPress installer that shows every important choice before it changes the
        server.
      </text>
      <box flexDirection="row" gap={1}>
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
      </box>
      <box
        backgroundColor={color("panel")}
        border
        borderColor={color("border")}
        flexDirection="column"
        gap={1}
        padding={1}
      >
        <text fg={color("text")}>
          This wizard prepares env files, Caddy HTTPS, Docker services, WordPress install, staging,
          backups, smoke checks, and performance reports.
        </text>
        <text fg={color("muted")}>
          Nothing privileged runs until review. Use --dry-run or --export-plan for a non-interactive
          audit.
        </text>
      </box>
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
      <InfoGrid rows={rows} />
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

export function DomainScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Field
        focused={focusIndex === 0}
        label="Production domain"
        onInput={(value) => update("productionDomain", value)}
        value={state.productionDomain}
      />
      <ToggleRow
        focused={focusIndex === 1}
        label="Also serve www alias"
        onToggle={() => update("wwwAlias", !state.wwwAlias)}
        value={state.wwwAlias}
      />
      <Field
        focused={focusIndex === 2}
        label="Staging domain"
        onInput={(value) => update("stagingDomain", value)}
        value={state.stagingDomain}
      />
      <text fg={color("muted")}>
        Production binds to 127.0.0.1:8080. Staging binds to 127.0.0.1:8082.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="DNS checks are part of the execution plan"
      />
    </box>
  );
}

export function ModeScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <select
        descriptionColor={color("muted")}
        focused={focusIndex === 0}
        height={9}
        onChange={(_, option) => option?.value && update("mode", option.value as InstallMode)}
        options={modeOptions}
        selectedBackgroundColor={color("accent")}
        selectedIndex={modeOptions.findIndex((option) => option.value === state.mode)}
        selectedTextColor={color("black")}
        showScrollIndicator
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
