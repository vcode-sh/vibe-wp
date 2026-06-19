import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";
import { useGlyphs } from "./glyph-context";
import { KeyCap } from "./keycap";

export { InfoGrid, Metric } from "./data-display";

export function Field({
  label,
  value,
  focused,
  onInput,
  secret = false,
  hint
}: {
  hint?: string;
  label: string;
  value: string;
  focused: boolean;
  onInput: (value: string) => void;
  secret?: boolean;
}) {
  const glyphs = useGlyphs();
  useKeyboard((key) => {
    if (!(secret && focused)) {
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

  return (
    <box
      backgroundColor={focused ? color("panel2") : color("panel")}
      borderColor={focused ? color("focusRing") : color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      height={hint ? 5 : 4}
      paddingX={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={focused ? color("accent") : color("muted")}>{label}</text>
        {focused && <text fg={color("accent")}>{glyphs.active}</text>}
      </box>
      {secret ? (
        <text fg={value ? color("text") : color("subtle")} truncate>
          {value ? "*".repeat(Math.min(value.length, 32)) : "Type secret value"}
        </text>
      ) : (
        <input
          backgroundColor={focused ? color("panel2") : color("panel")}
          cursorColor={color("accent")}
          focused={focused}
          focusedBackgroundColor={color("panel2")}
          onInput={onInput}
          placeholder={label}
          textColor={color("text")}
          value={value}
        />
      )}
      {hint && (
        <text fg={color("subtle")} truncate>
          {hint}
        </text>
      )}
    </box>
  );
}

export function ToggleRow({
  label,
  value,
  focused,
  onToggle
}: {
  label: string;
  value: boolean;
  focused: boolean;
  onToggle: () => void;
}) {
  const glyphs = useGlyphs();
  useKeyboard((key) => {
    if (focused && (key.name === "return" || key.name === "enter" || key.name === "space")) {
      onToggle();
    }
  });

  return (
    <box
      alignItems="center"
      backgroundColor={focused ? color("selectionBg") : color("panel")}
      borderColor={focused ? color("focusRing") : color("border")}
      borderStyle={BORDER.frame}
      flexDirection="row"
      height={3}
      justifyContent="space-between"
      paddingX={1}
    >
      <text fg={color("text")}>{label}</text>
      <box flexDirection="row" gap={space.sm}>
        <text fg={value ? color("success") : color("subtle")}>
          {value ? glyphs.ok : glyphs.pending}
        </text>
        <text attributes={TextAttributes.BOLD} fg={value ? color("success") : color("muted")}>
          {value ? "on" : "off"}
        </text>
      </box>
    </box>
  );
}

export function Panel({ title, content }: { title: string; content: string }) {
  return (
    <box
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      padding={space.sm}
    >
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        {title}
      </text>
      <text fg={color("text")} wrapMode="word">
        {content || "None"}
      </text>
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
    <box
      alignItems="center"
      borderColor={color("accent")}
      borderStyle={BORDER.frame}
      flexDirection="row"
      gap={space.sm}
      height={4}
      justifyContent="space-between"
      paddingX={1}
    >
      <box alignItems="center" flexDirection="row" gap={space.sm}>
        <KeyCap>{glyphs.enter}</KeyCap>
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {primary}
        </text>
      </box>
      <text fg={color("muted")} truncate>
        {secondary}
      </text>
    </box>
  );
}
