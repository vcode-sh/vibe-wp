import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color } from "../app/theme";

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
      backgroundColor={focused ? color("panel3") : color("panel")}
      border
      borderColor={focused ? color("accent") : color("border")}
      flexDirection="column"
      flexGrow={1}
      height={hint ? 5 : 4}
      paddingX={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={focused ? color("accent") : color("muted")}>{label}</text>
        {focused && <text fg={color("subtle")}>editing</text>}
      </box>
      {secret ? (
        <text fg={value ? color("text") : color("subtle")} truncate>
          {value ? "*".repeat(Math.min(value.length, 32)) : "Type secret value"}
        </text>
      ) : (
        <input
          backgroundColor={focused ? color("panel3") : color("panel")}
          cursorColor={color("accent")}
          focused={focused}
          focusedBackgroundColor={color("panel3")}
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
  useKeyboard((key) => {
    if (focused && (key.name === "return" || key.name === "enter" || key.name === "space")) {
      onToggle();
    }
  });

  return (
    <box
      alignItems="center"
      backgroundColor={focused ? color("panel3") : color("panel")}
      border
      borderColor={focused ? color("accent") : color("border")}
      flexDirection="row"
      height={3}
      justifyContent="space-between"
      paddingX={1}
    >
      <text fg={color("text")}>{label}</text>
      <text attributes={TextAttributes.BOLD} fg={value ? color("success") : color("muted")}>
        {value ? "ON" : "OFF"}
      </text>
    </box>
  );
}

export function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "accent" | "success" | "warning";
}) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      flexGrow={1}
      height={4}
      paddingX={1}
    >
      <text fg={color("muted")}>{label}</text>
      <text fg={color(tone)} truncate>
        {value}
      </text>
    </box>
  );
}

export function InfoGrid({ rows }: { rows: [string, string][] }) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      gap={1}
      padding={1}
    >
      {rows.map(([label, value]) => (
        <box flexDirection="row" gap={2} justifyContent="space-between" key={label}>
          <text fg={color("muted")} truncate>
            {label}
          </text>
          <text fg={color("text")} truncate>
            {value}
          </text>
        </box>
      ))}
    </box>
  );
}

export function Panel({ title, content }: { title: string; content: string }) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("border")}
      flexDirection="column"
      flexGrow={1}
      padding={1}
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
  useKeyboard((key) => {
    if (key.name === "return" || key.name === "enter") {
      onPrimary();
    }
  });

  return (
    <box
      alignItems="center"
      backgroundColor={color("panel")}
      border
      borderColor={color("accent")}
      flexDirection="row"
      height={4}
      justifyContent="space-between"
      paddingX={1}
    >
      <text attributes={TextAttributes.BOLD} fg={color("accent")}>
        Enter: {primary}
      </text>
      <text fg={color("muted")} truncate>
        {secondary}
      </text>
    </box>
  );
}
