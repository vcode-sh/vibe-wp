import { backupOptions, scheduleOptions } from "../app/options";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { ActionRow, Field } from "../components/primitives";
import { suggestedBackupDir } from "../core/backup";
import { shortPath } from "../core/site-profile";
import type { BackupPolicy, BackupSchedule } from "../core/types";

// Focus order: destination(0), folder(1), retention(2), schedule(3),
// then R2 account(4), access key(5), secret(6), bucket(7) when R2 is on.
export function BackupScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  const showLocal = state.backupPolicy !== "manual";
  const showR2 = state.backupPolicy === "external-later";

  function setDestination(value: string) {
    const policy = value as BackupPolicy;
    update("backupPolicy", policy);
    update("backupR2Enabled", policy === "external-later");
  }

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        Backups protect your site. Keep them local, or also copy every backup off-server to
        Cloudflare R2 — the safest option if the server itself fails.
      </text>
      <ChoiceList
        focused={focusIndex === 0}
        onChange={setDestination}
        options={backupOptions}
        value={state.backupPolicy}
      />
      {showLocal && (
        <>
          <Field
            focused={focusIndex === 1}
            hint={`Created on install — suggested ${shortPath(suggestedBackupDir(state.siteSlug), 2)}`}
            label="Backup folder"
            onFocus={() => setFocusIndex(1)}
            onInput={(value) => update("backupDir", value)}
            value={state.backupDir}
          />
          <box flexDirection="row" gap={2}>
            <Field
              focused={focusIndex === 2}
              grow
              hint="older ones are deleted"
              label="How many backups to keep"
              onFocus={() => setFocusIndex(2)}
              onInput={(value) => update("backupRetention", value.replace(/[^0-9]/g, ""))}
              value={state.backupRetention}
            />
            <box flexBasis={0} flexGrow={1}>
              <text fg={focusIndex === 3 ? color("accent") : color("muted")}>
                Automatic schedule
              </text>
              <ChoiceList
                focused={focusIndex === 3}
                onChange={(value) => update("backupSchedule", value as BackupSchedule)}
                options={scheduleOptions}
                value={state.backupSchedule}
              />
            </box>
          </box>
        </>
      )}
      {showR2 && (
        <R2Fields
          focusIndex={focusIndex}
          setFocusIndex={setFocusIndex}
          state={state}
          update={update}
        />
      )}
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary={
          showR2
            ? "R2 keys are stored only in your private env file"
            : "Off-server copies add real safety"
        }
      />
    </box>
  );
}

function R2Fields({
  state,
  update,
  focusIndex,
  setFocusIndex
}: Pick<ScreenProps, "state" | "update" | "focusIndex" | "setFocusIndex">) {
  return (
    <box flexDirection="column" gap={1}>
      <Field
        focused={focusIndex === 4}
        hint="from your Cloudflare dashboard"
        label="R2 account ID"
        onFocus={() => setFocusIndex(4)}
        onInput={(value) => update("r2AccountId", value)}
        value={state.r2AccountId}
      />
      <box flexDirection="row" gap={2}>
        <Field
          focused={focusIndex === 5}
          grow
          label="R2 access key ID"
          onFocus={() => setFocusIndex(5)}
          onInput={(value) => update("r2AccessKeyId", value)}
          value={state.r2AccessKeyId}
        />
        <Field
          focused={focusIndex === 7}
          grow
          label="R2 bucket"
          onFocus={() => setFocusIndex(7)}
          onInput={(value) => update("r2Bucket", value)}
          value={state.r2Bucket}
        />
      </box>
      <Field
        focused={focusIndex === 6}
        label="R2 secret access key"
        onFocus={() => setFocusIndex(6)}
        onInput={(value) => update("r2SecretKey", value)}
        secret
        value={state.r2SecretKey}
      />
    </box>
  );
}
