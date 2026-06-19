import { color } from "../app/theme";
import { space } from "../app/tokens";

// opencode-style keybind hints: plain text, the key slightly brighter than its
// label, generous spacing, no chip chrome.
export function KeyHints({ hints }: { hints: Array<{ key: string; label: string }> }) {
  return (
    <box flexDirection="row" gap={space.md}>
      {hints.map((hint) => (
        <box flexDirection="row" gap={space.sm} key={`${hint.key}-${hint.label}`}>
          <text fg={color("muted")}>{hint.key}</text>
          <text fg={color("subtle")}>{hint.label}</text>
        </box>
      ))}
    </box>
  );
}
