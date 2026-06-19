import type { MouseEvent } from "@opentui/core";

// Centralised mouse-click adapter so every clickable box behaves the same:
// left-button press only, default suppressed, propagation stopped so a click
// never bubbles into a parent handler (e.g. a row click must not also hit the
// surrounding panel). Keyboard handlers stay untouched — this only adds mouse.
export function clickProps(onClick: () => void): { onMouseDown: (event: MouseEvent) => void } {
  return {
    onMouseDown: (event: MouseEvent) => {
      // button 0 is the left button; ignore right/middle/wheel presses.
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }
  };
}
