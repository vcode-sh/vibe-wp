import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { checkEmail } from "../core/field-checks";

// Focus order: enable toggle(0), then email(1), webhook(2), telegram token(3),
// telegram chat(4) when monitoring is on.
export function MonitoringScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        Every hour we check uptime, disk space, HTTPS certificate expiry, backup freshness, and
        containers. Add a channel below to be alerted the moment something is wrong.
      </text>
      <ToggleRow
        focused={focusIndex === 0}
        label="Watch this site and alert me to problems"
        onFocus={() => setFocusIndex(0)}
        onToggle={() => update("monitorEnabled", !state.monitorEnabled)}
        value={state.monitorEnabled}
      />
      {state.monitorEnabled && (
        <>
          <Field
            feedback={state.monitorEmail ? checkEmail(state.monitorEmail) : undefined}
            focused={focusIndex === 1}
            hint="leave blank to skip email alerts"
            label="Alert email"
            onFocus={() => setFocusIndex(1)}
            onInput={(value) => update("monitorEmail", value)}
            value={state.monitorEmail}
          />
          <Field
            focused={focusIndex === 2}
            hint="POST JSON on failure (Slack/Discord/n8n/etc.)"
            label="Alert webhook URL"
            onFocus={() => setFocusIndex(2)}
            onInput={(value) => update("monitorWebhookUrl", value)}
            value={state.monitorWebhookUrl}
          />
          <box flexDirection="row" gap={2}>
            <Field
              focused={focusIndex === 3}
              grow
              label="Telegram bot token"
              onFocus={() => setFocusIndex(3)}
              onInput={(value) => update("monitorTelegramToken", value)}
              secret
              value={state.monitorTelegramToken}
            />
            <Field
              focused={focusIndex === 4}
              grow
              label="Telegram chat ID"
              onFocus={() => setFocusIndex(4)}
              onInput={(value) => update("monitorTelegramChat", value)}
              value={state.monitorTelegramChat}
            />
          </box>
          <text fg={color("subtle")} wrapMode="word">
            No channel? Checks still run hourly and show in the dashboard's "Health check & alerts".
          </text>
        </>
      )}
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="You can change channels later in the env file"
      />
    </box>
  );
}
