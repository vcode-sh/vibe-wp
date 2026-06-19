import { useEffect, useState } from "react";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useAscii } from "./glyph-context";
import { spinnerFrames } from "./glyphs";

export function Spinner() {
  const ascii = useAscii();
  const frames = spinnerFrames(ascii);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((value) => (value + 1) % frames.length);
    }, 100);
    return () => clearInterval(id);
  }, [frames.length]);
  return <text fg={color("accent")}>{frames[index]}</text>;
}

export function ProgressBar({
  value,
  total,
  width = 24
}: {
  value: number;
  total: number;
  width?: number;
}) {
  const ascii = useAscii();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const filled = Math.round(ratio * width);
  const bar = (ascii ? "#" : "█").repeat(filled) + (ascii ? "-" : "░").repeat(width - filled);
  return (
    <box flexDirection="row" gap={space.sm}>
      <text fg={color("accent")}>{bar}</text>
      <text fg={color("muted")}>
        {value}/{total}
      </text>
    </box>
  );
}
