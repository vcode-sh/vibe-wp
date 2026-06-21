import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { NoteBox } from "../components/section";

export function AiScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
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
        onFocus={() => setFocusIndex(0)}
        onInput={(value) => update("aiOpenAiKey", value)}
        secret
        value={state.aiOpenAiKey}
      />
      <Field
        focused={focusIndex === 1}
        label="Google API key"
        onFocus={() => setFocusIndex(1)}
        onInput={(value) => update("aiGoogleKey", value)}
        secret
        value={state.aiGoogleKey}
      />
      <Field
        focused={focusIndex === 2}
        label="Anthropic API key"
        onFocus={() => setFocusIndex(2)}
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

export function StagingScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        Staging is a private copy of your site where you can test plugins and changes safely before
        they go live. Recommended.
      </text>
      <ToggleRow
        focused={focusIndex === 0}
        label="Create a staging copy"
        onFocus={() => setFocusIndex(0)}
        onToggle={() => update("stagingEnabled", !state.stagingEnabled)}
        value={state.stagingEnabled}
      />
      <Field
        focused={focusIndex === 1}
        label="Staging domain"
        onFocus={() => setFocusIndex(1)}
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
