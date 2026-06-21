import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color, type ThemeColor } from "../app/theme";
import { FOCUS_ID, space } from "../app/tokens";
import type { FieldFeedback } from "../core/field-checks";
import { useGlyphs } from "./glyph-context";
import { clickProps } from "./mouse";

const FEEDBACK_COLOR: Record<FieldFeedback["tone"], ThemeColor> = {
  ok: "success",
  warn: "warning",
  error: "danger"
};

export function Field({
  label,
  value,
  focused,
  onInput,
  onFocus,
  secret = false,
  hint,
  feedback,
  grow = false
}: {
  feedback?: FieldFeedback;
  grow?: boolean;
  hint?: string;
  label: string;
  value: string;
  focused: boolean;
  onInput: (value: string) => void;
  // Click anywhere on the field to focus it (parity with keyboard Tab).
  onFocus?: () => void;
  secret?: boolean;
}) {
  const glyphs = useGlyphs();
  useSecretInput(secret && focused, value, onInput);

  return (
    <box
      backgroundColor={focused ? color("selectionBg") : undefined}
      border={["left"]}
      borderColor={focused ? color("focusRing") : color("divider")}
      flexBasis={grow ? 0 : undefined}
      flexDirection="column"
      flexGrow={grow ? 1 : 0}
      flexShrink={grow ? 1 : 0}
      height={hint || feedback ? 3 : 2}
      id={focused ? FOCUS_ID : undefined}
      paddingX={1}
      {...(onFocus && !focused ? clickProps(onFocus) : {})}
    >
      <box flexDirection="row" gap={space.sm} justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={focused ? color("accent") : color("muted")}>
          {label}
        </text>
        {focused && <text fg={color("accent")}>{glyphs.active}</text>}
      </box>
      {secret ? (
        <text fg={value ? color("text") : color("subtle")} truncate>
          {value ? "*".repeat(Math.min(value.length, 32)) : "Type secret value"}
        </text>
      ) : (
        <input
          backgroundColor={focused ? color("selectionBg") : color("panel")}
          cursorColor={color("accent")}
          focused={focused}
          focusedBackgroundColor={color("selectionBg")}
          onInput={onInput}
          placeholder=""
          textColor={color("text")}
          value={value}
        />
      )}
      <FieldFooter feedback={feedback} hint={hint} />
    </box>
  );
}

function FieldFooter({ feedback, hint }: { feedback?: FieldFeedback; hint?: string }) {
  const glyphs = useGlyphs();
  if (feedback) {
    return (
      <text fg={color(FEEDBACK_COLOR[feedback.tone])} truncate>
        {feedback.tone === "ok" ? glyphs.done : glyphs.warn} {feedback.text}
      </text>
    );
  }
  if (hint) {
    return (
      <text fg={color("subtle")} truncate>
        {hint}
      </text>
    );
  }
  return null;
}

// Secret fields use a plain <text> mask (not <input>), so we drive editing from
// raw key events while the field is focused.
function useSecretInput(active: boolean, value: string, onInput: (value: string) => void) {
  useKeyboard((key) => {
    if (!active) {
      return;
    }
    if (key.name === "backspace") {
      onInput(value.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.name.length > 1) {
      return;
    }
    if (key.raw.length === 1) {
      onInput(`${value}${key.raw}`);
    }
  });
}

export function ToggleRow({
  label,
  value,
  focused,
  onToggle,
  onFocus
}: {
  label: string;
  value: boolean;
  focused: boolean;
  onToggle: () => void;
  // Click moves focus here first, then toggles — so the focus ring always
  // matches the control that just changed.
  onFocus?: () => void;
}) {
  // Space toggles (Enter is reserved for "continue" so it never double-fires).
  useKeyboard((key) => {
    if (focused && key.name === "space") {
      onToggle();
    }
  });

  return (
    <box
      alignItems="center"
      backgroundColor={focused ? color("selectionBg") : undefined}
      border={["left"]}
      borderColor={focused ? color("focusRing") : color("divider")}
      flexDirection="row"
      height={1}
      id={focused ? FOCUS_ID : undefined}
      justifyContent="space-between"
      paddingX={1}
      {...clickProps(() => {
        onFocus?.();
        onToggle();
      })}
    >
      <text attributes={focused ? TextAttributes.BOLD : TextAttributes.NONE} fg={color("text")}>
        {label}
      </text>
      <box alignItems="center" flexDirection="row" gap={space.md}>
        {focused && <text fg={color("subtle")}>space to toggle</text>}
        <box backgroundColor={value ? color("success") : color("elevated")} paddingX={1}>
          <text attributes={TextAttributes.BOLD} fg={value ? color("black") : color("muted")}>
            {value ? "ON" : "OFF"}
          </text>
        </box>
      </box>
    </box>
  );
}

export function ActionRow({
  primary,
  secondary,
  onPrimary
}: {
  primary: string;
  secondary: string;
  onPrimary: () => void;
}) {
  const glyphs = useGlyphs();
  useKeyboard((key) => {
    if (key.name === "return" || key.name === "enter") {
      onPrimary();
    }
  });

  return (
    <box alignItems="center" flexDirection="row" gap={space.md} height={1} paddingX={1}>
      <box
        alignItems="center"
        backgroundColor={color("accent")}
        flexDirection="row"
        paddingX={2}
        {...clickProps(onPrimary)}
      >
        <text attributes={TextAttributes.BOLD} fg={color("accentText")}>
          {glyphs.enter} {primary}
        </text>
      </box>
      <text fg={color("subtle")} truncate>
        {secondary}
      </text>
    </box>
  );
}
