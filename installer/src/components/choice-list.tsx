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

  return (
    <box flexDirection="column" gap={space.xs}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <ChoiceRow
            active={active}
            focused={focused}
            index={index}
            key={option.value}
            marker={active ? glyphs.active : glyphs.bullet}
            option={option}
          />
        );
      })}
    </box>
  );
}

function ChoiceRow({
  active,
  focused,
  index,
  marker,
  option
}: {
  active: boolean;
  focused: boolean;
  index: number;
  marker: string;
  option: { description: string; name: string; value: string };
}) {
  const markerColor = active ? color(focused ? "accent" : "muted") : color("subtle");
  return (
    <box
      backgroundColor={active ? color("selectionBg") : color("panel")}
      flexDirection="column"
      paddingX={1}
    >
      <box flexDirection="row" gap={space.sm}>
        <text fg={markerColor}>{marker}</text>
        <text
          attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          fg={color(active ? "text" : "muted")}
        >
          {index + 1}. {option.name}
        </text>
      </box>
      <text fg={color("subtle")} wrapMode="word">
        {option.description}
      </text>
    </box>
  );
}
