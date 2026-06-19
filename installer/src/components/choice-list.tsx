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
          name={option.name}
        />
      ))}
      {activeOption && (
        <box flexDirection="row" gap={space.sm} paddingX={2}>
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
  name
}: {
  active: boolean;
  focused: boolean;
  index: number;
  name: string;
}) {
  // t1code pattern: a 1-char left accent bar (bright when focused) plus a
  // muted-blue surface; normal bold text. No border prop (it mis-renders).
  const barColor = activeBarColor(active, focused);
  return (
    <box
      alignItems="stretch"
      backgroundColor={active ? color("selectionBg") : undefined}
      flexDirection="row"
      height={1}
    >
      <box backgroundColor={barColor} flexShrink={0} width={1} />
      <box alignItems="center" flexDirection="row" flexGrow={1} paddingX={1}>
        <text
          attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          fg={active ? color("text") : color("muted")}
          truncate
        >
          {index + 1}. {name}
        </text>
      </box>
    </box>
  );
}

function activeBarColor(active: boolean, focused: boolean): string | undefined {
  if (!active) {
    return;
  }
  return focused ? color("accentBar") : color("selectionBg");
}
