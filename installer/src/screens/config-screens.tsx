import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { backupOptions, performanceOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { InfoGrid } from "../components/data-display";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { NoteBox } from "../components/section";
import { performanceValues } from "../core/defaults";
import type { BackupPolicy, PerformancePreset } from "../core/types";

export function PerformanceScreen({ state, update, focusIndex, next }: ScreenProps) {
  const values = performanceValues(state.performancePreset, state.host.totalMemoryMb);
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        We match PHP, Redis, and cache settings to your server's memory. Not sure? Keep Balanced —
        it fits most business sites.
      </text>
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => update("performancePreset", value as PerformancePreset)}
        options={performanceOptions}
        value={state.performancePreset}
      />
      <InfoGrid rows={Object.entries(values).slice(0, 8)} />
      <text fg={color("subtle")} truncate>
        These exact values are written to your env files, so nothing is hidden.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Balanced is safest for most VPS sites"
      />
    </box>
  );
}

export function AiScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        Optional — press Enter to skip.
      </text>
      <text fg={color("muted")} wrapMode="word">
        The WordPress AI plugin installs either way. Only paste a provider key if you already have
        one; you can always add them later.
      </text>
      <Field
        focused={focusIndex === 0}
        label="OpenAI API key"
        onInput={(value) => update("aiOpenAiKey", value)}
        secret
        value={state.aiOpenAiKey}
      />
      <Field
        focused={focusIndex === 1}
        label="Google API key"
        onInput={(value) => update("aiGoogleKey", value)}
        secret
        value={state.aiGoogleKey}
      />
      <Field
        focused={focusIndex === 2}
        label="Anthropic API key"
        onInput={(value) => update("aiAnthropicKey", value)}
        secret
        value={state.aiAnthropicKey}
      />
      <text fg={color("muted")}>
        Keys are optional. The installer does not call provider APIs during setup.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="You can add keys later in env files"
      />
    </box>
  );
}

export function BackupScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        How should we protect your site? "Local first" makes a backup right after install — a good
        safe default.
      </text>
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => update("backupPolicy", value as BackupPolicy)}
        options={backupOptions}
        value={state.backupPolicy}
      />
      <text fg={color("warning")} wrapMode="word">
        Backups on the same server aren't enough if the server itself fails — add off-server backups
        (R2/S3) later for real safety.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="External R2/S3 can be added as a later backend"
      />
    </box>
  );
}

export function StagingScreen({ state, update, focusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        Staging is a private copy of your site where you can test plugins and changes safely before
        they go live. Recommended.
      </text>
      <ToggleRow
        focused={focusIndex === 0}
        label="Create a staging copy"
        onToggle={() => update("stagingEnabled", !state.stagingEnabled)}
        value={state.stagingEnabled}
      />
      <Field
        focused={focusIndex === 1}
        label="Staging domain"
        onInput={(value) => update("stagingDomain", value)}
        value={state.stagingDomain}
      />
      <NoteBox tone="success">
        <text attributes={TextAttributes.BOLD} fg={color("success")}>
          Staging is kept safe automatically
        </text>
        <text fg={color("muted")}>
          · Hidden from Google so it never competes with your live site
        </text>
        <text fg={color("muted")}>· Can't send emails to real customers</text>
        <text fg={color("muted")}>· Fully separate from live — testing here never touches it</text>
      </NoteBox>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Recommended for non-technical owners"
      />
    </box>
  );
}
