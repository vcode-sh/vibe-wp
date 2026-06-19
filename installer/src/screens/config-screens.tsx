import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { backupOptions, performanceOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { ActionRow, Field, InfoGrid, ToggleRow } from "../components/primitives";
import { performanceValues } from "../core/defaults";
import type { BackupPolicy, PerformancePreset } from "../core/types";

export function PerformanceScreen({ state, update, focusIndex, next }: ScreenProps) {
  const values = performanceValues(state.performancePreset, state.host.totalMemoryMb);
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => update("performancePreset", value as PerformancePreset)}
        options={performanceOptions}
        value={state.performancePreset}
      />
      <InfoGrid rows={Object.entries(values).slice(0, 8)} />
      <text fg={color("muted")}>
        These values are written to env files, so advanced users can audit every tuning choice.
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
      <text fg={color("text")}>
        WordPress AI plugin plus Anthropic, Google, and OpenAI connectors stay in the baseline
        install.
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
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => update("backupPolicy", value as BackupPolicy)}
        options={backupOptions}
        value={state.backupPolicy}
      />
      <text fg={color("warning")}>
        Local VPS backups are not enough for disaster recovery. The UI keeps that warning visible.
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
      <ToggleRow
        focused={focusIndex === 0}
        label="Create staging"
        onToggle={() => update("stagingEnabled", !state.stagingEnabled)}
        value={state.stagingEnabled}
      />
      <Field
        focused={focusIndex === 1}
        label="Staging domain"
        onInput={(value) => update("stagingDomain", value)}
        value={state.stagingDomain}
      />
      <box
        backgroundColor={color("panel")}
        border
        borderColor={color("border")}
        flexDirection="column"
        padding={1}
      >
        <text attributes={TextAttributes.BOLD} fg={color("success")}>
          Staging safeguards
        </text>
        <text fg={color("muted")}>VIBE_WP_FORCE_NOINDEX=1</text>
        <text fg={color("muted")}>VIBE_WP_DISABLE_OUTBOUND_MAIL=1</text>
        <text fg={color("muted")}>Separate Compose project, DB, Redis, and wp-content volume.</text>
      </box>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Recommended for non-technical owners"
      />
    </box>
  );
}
