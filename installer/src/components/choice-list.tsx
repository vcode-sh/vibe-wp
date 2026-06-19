import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { color } from "../app/theme";

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
    <box flexDirection="column" gap={1}>
      {options.map((option, index) => (
        <ChoiceRow
          active={option.value === value}
          index={index}
          key={option.value}
          option={option}
        />
      ))}
    </box>
  );
}

function ChoiceRow({
  active,
  index,
  option
}: {
  active: boolean;
  index: number;
  option: { description: string; name: string; value: string };
}) {
  return (
    <box
      backgroundColor={active ? color("panel3") : color("panel")}
      border
      borderColor={active ? color("accent") : color("border")}
      flexDirection="column"
      paddingX={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={active ? TextAttributes.BOLD : TextAttributes.NONE} fg={color("text")}>
          {index + 1}. {option.name}
        </text>
        {active && <text fg={color("accent")}>selected</text>}
      </box>
      <text fg={color("muted")} wrapMode="word">
        {option.description}
      </text>
    </box>
  );
}
