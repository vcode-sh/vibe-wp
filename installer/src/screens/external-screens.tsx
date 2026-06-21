import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ActionRow, Field } from "../components/primitives";
import { checkExtDbHost, checkExtHost } from "../core/field-checks";

export function ExternalDbScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")}>
        Bring your own database. WordPress and Nginx run in Docker; MariaDB stays on your managed
        server.
      </text>
      <Field
        feedback={checkExtDbHost(state.extDbHost)}
        focused={focusIndex === 0}
        hint="host or host:port"
        label="Database host"
        onFocus={() => setFocusIndex(0)}
        onInput={(value) => update("extDbHost", value)}
        value={state.extDbHost}
      />
      <box flexDirection="row" gap={2}>
        <Field
          focused={focusIndex === 1}
          grow
          label="Database name"
          onFocus={() => setFocusIndex(1)}
          onInput={(value) => update("extDbName", value)}
          value={state.extDbName}
        />
        <Field
          focused={focusIndex === 2}
          grow
          label="Database user"
          onFocus={() => setFocusIndex(2)}
          onInput={(value) => update("extDbUser", value)}
          value={state.extDbUser}
        />
      </box>
      <Field
        focused={focusIndex === 3}
        label="Database password"
        onFocus={() => setFocusIndex(3)}
        onInput={(value) => update("extDbPassword", value)}
        secret
        value={state.extDbPassword}
      />
      <box flexDirection="row" gap={2}>
        <Field
          focused={focusIndex === 4}
          grow
          label="Charset"
          onFocus={() => setFocusIndex(4)}
          onInput={(value) => update("extDbCharset", value)}
          value={state.extDbCharset}
        />
        <Field
          focused={focusIndex === 5}
          grow
          label="Table prefix"
          onFocus={() => setFocusIndex(5)}
          onInput={(value) => update("extDbTablePrefix", value)}
          value={state.extDbTablePrefix}
        />
      </box>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="The database must already exist and accept connections from this VPS"
      />
    </box>
  );
}

export function ExternalRedisScreen({
  state,
  update,
  focusIndex,
  setFocusIndex,
  next
}: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")}>
        Object cache uses your external Redis. Leave the password blank if Redis has no auth.
      </text>
      <Field
        feedback={checkExtHost(state.extRedisHost)}
        focused={focusIndex === 0}
        label="Redis host"
        onFocus={() => setFocusIndex(0)}
        onInput={(value) => update("extRedisHost", value)}
        value={state.extRedisHost}
      />
      <box flexDirection="row" gap={2}>
        <Field
          focused={focusIndex === 1}
          grow
          label="Redis port"
          onFocus={() => setFocusIndex(1)}
          onInput={(value) => update("extRedisPort", value)}
          value={state.extRedisPort}
        />
        <Field
          focused={focusIndex === 2}
          grow
          label="Database index"
          onFocus={() => setFocusIndex(2)}
          onInput={(value) => update("extRedisDatabase", value)}
          value={state.extRedisDatabase}
        />
      </box>
      <Field
        focused={focusIndex === 3}
        label="Redis password"
        onFocus={() => setFocusIndex(3)}
        onInput={(value) => update("extRedisPassword", value)}
        secret
        value={state.extRedisPassword}
      />
      <Field
        focused={focusIndex === 4}
        hint="tcp or tls"
        label="Scheme"
        onFocus={() => setFocusIndex(4)}
        onInput={(value) => update("extRedisScheme", value)}
        value={state.extRedisScheme}
      />
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Only WordPress and Nginx will run in Docker"
      />
    </box>
  );
}
