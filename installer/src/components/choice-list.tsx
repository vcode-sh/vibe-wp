import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "./glyph-context";

export function ChoiceList<T extends string>({
  focused,
  options,
  value,
  onChange
}: {
  focused: boolean;
  onChange: (value: T) => void;
  options: Array<{ description: string; name: string; value: T }>;
  value: T;
}) {
  const glyphs = useGlyphs();
  useKeyboard((key) => {
    if (!focused) {
      return;
    }
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value)
    );
    if (key.name === "down") {
      onChange(options[(index + 1) % options.length]?.value ?? value);
    }
    if (key.name === "up") {
      onChange(options[(index - 1 + options.length) % options.length]?.value ?? value);
    }
    const number = Number(key.raw);
    if (Number.isInteger(number) && number >= 1 && number <= options.length) {
      onChange(options[number - 1]?.value ?? value);
    }
  });

  const activeOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <box flexDirection="column" gap={space.xs}>
      {options.map((option, index) => (
        <ChoiceRow
          active={option.value === value}
          focused={focused}
          index={index}
          key={option.value}
          marker={option.value === value ? glyphs.active : " "}
          name={option.name}
        />
      ))}
      {activeOption && (
        <box flexDirection="row" gap={space.sm} paddingX={1}>
          <text fg={color("subtle")}>{glyphs.bullet}</text>
          <text fg={color("muted")} truncate>
            {activeOption.description}
          </text>
        </box>
      )}
    </box>
  );
}

function ChoiceRow({
  active,
  focused,
  index,
  marker,
  name
}: {
  active: boolean;
  focused: boolean;
  index: number;
  marker: string;
  name: string;
}) {
  // opencode signature: the selected row is a full-width accent bar with
  // contrasting bold text; only when the list itself is focused.
  const barColor = rowBackground(active, focused);
  const textColor = rowTextColor(active, focused);
  return (
    <box
      alignItems="center"
      backgroundColor={barColor}
      flexDirection="row"
      gap={space.sm}
      height={1}
      paddingX={1}
    >
      <text fg={textColor}>{marker}</text>
      <text attributes={active ? TextAttributes.BOLD : TextAttributes.NONE} fg={textColor} truncate>
        {index + 1}. {name}
      </text>
    </box>
  );
}

function rowBackground(active: boolean, focused: boolean): string | undefined {
  if (!active) {
    return;
  }
  return focused ? color("accent") : color("selectionBg");
}

function rowTextColor(active: boolean, focused: boolean): string {
  if (active && focused) {
    return color("accentText");
  }
  return active ? color("text") : color("muted");
}
