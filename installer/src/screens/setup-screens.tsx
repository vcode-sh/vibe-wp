import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { InfoGrid } from "../components/data-display";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { Section } from "../components/section";
import { checkEmail } from "../core/field-checks";

export function SystemScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
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
        onFocus={() => setFocusIndex(0)}
        onToggle={() => update("installDocker", !state.installDocker)}
        value={state.installDocker}
      />
      <ToggleRow
        focused={focusIndex === 1}
        label="Install Caddy if missing"
        onFocus={() => setFocusIndex(1)}
        onToggle={() => update("installCaddy", !state.installCaddy)}
        value={state.installCaddy}
      />
      <ToggleRow
        focused={focusIndex === 2}
        label="Secure the server (firewall, fail2ban, auto-updates)"
        onFocus={() => setFocusIndex(2)}
        onToggle={() => update("hardenServer", !state.hardenServer)}
        value={state.hardenServer}
      />
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Host changes stay pending until review"
      />
    </box>
  );
}

export function ModeScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Section title="Install location">
        <Field
          focused={focusIndex === 0}
          label="Install folder"
          onFocus={() => setFocusIndex(0)}
          onInput={(value) => update("installDir", value)}
          value={state.installDir}
        />
        <Field
          focused={focusIndex === 1}
          hint="branch or tag — leave as-is unless told otherwise"
          label="Version to deploy"
          onFocus={() => setFocusIndex(1)}
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
        secondary="Most people never change these — press Enter"
      />
    </box>
  );
}

export function AdminScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        This is the account you'll use to log in to WordPress. We generate a strong password for
        you.
      </text>
      <Field
        focused={focusIndex === 0}
        label="Site title"
        onFocus={() => setFocusIndex(0)}
        onInput={(value) => update("siteTitle", value)}
        value={state.siteTitle}
      />
      <Field
        focused={focusIndex === 1}
        label="Admin username"
        onFocus={() => setFocusIndex(1)}
        onInput={(value) => update("adminUser", value)}
        value={state.adminUser}
      />
      <Field
        feedback={checkEmail(state.adminEmail)}
        focused={focusIndex === 2}
        label="Admin email"
        onFocus={() => setFocusIndex(2)}
        onInput={(value) => update("adminEmail", value)}
        value={state.adminEmail}
      />
      <Field
        focused={focusIndex === 3}
        hint="strong, auto-generated — saved to your env file to log in with"
        label="Admin password"
        onFocus={() => setFocusIndex(3)}
        onInput={(value) => update("adminPassword", value)}
        secret
        value={state.adminPassword}
      />
      <Field
        focused={focusIndex === 4}
        label="Locale"
        onFocus={() => setFocusIndex(4)}
        onInput={(value) => update("locale", value)}
        value={state.locale}
      />
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="You can change all of this later in WordPress"
      />
    </box>
  );
}
