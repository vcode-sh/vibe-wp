import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";
import { useGlyphs } from "./glyph-context";

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
      backgroundColor={focused ? color("selectionBg") : undefined}
      border={["left"]}
      borderColor={focused ? color("focusRing") : color("divider")}
      flexDirection="column"
      flexShrink={0}
      height={hint ? 3 : 2}
      paddingX={1}
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
  const lines = (content || "None").split("\n");
  return (
    <box
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      padding={space.sm}
    >
      <box border={["bottom"]} borderColor={color("divider")} flexDirection="row" height={2}>
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {title}
        </text>
      </box>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: preview lines are positional
        <text fg={color("text")} height={1} key={`${title}-${index}`} truncate>
          {line}
        </text>
      ))}
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
      <box alignItems="center" backgroundColor={color("accent")} flexDirection="row" paddingX={2}>
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
