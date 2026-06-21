import type { StepId } from "./steps";

// Screens whose ↑/↓ adjusts a choice list instead of moving field focus.
const choiceStepIds = new Set(["sites", "performance", "backup"]);

export interface AppKeyContext {
  currentId: StepId;
  destroy: () => void;
  // True when a text input is focused, so we must not steal printable keys
  // (like "?") or cursor keys — they belong to the input being edited.
  editingText: boolean;
  // True when help fills the screen (compact mode): it acts as a modal, so keys
  // close it rather than falling through to the form underneath.
  helpModal: boolean;
  moveFocus: (delta: number) => void;
  next: () => void;
  previous: () => void;
  toggleHelp: () => void;
  toggleLog: () => void;
}

interface AppKey {
  ctrl: boolean;
  name: string;
}

export function handleAppKey(key: AppKey, context: AppKeyContext) {
  if (key.ctrl && key.name === "c") {
    context.destroy();
    return;
  }
  // Full-screen help is modal: Esc / F1 / ? dismiss it; everything else is
  // swallowed so it can't disturb the form hidden behind it.
  if (context.helpModal) {
    if (key.name === "escape" || key.name === "f1" || key.name === "?") {
      context.toggleHelp();
    }
    return;
  }
  // Esc always goes back; it never conflicts with text editing.
  if (key.name === "escape") {
    context.previous();
    return;
  }
  // F1 is the universal help key (works even while editing a field). "?" is a
  // convenience that only fires when no text input would otherwise receive it.
  if (key.name === "f1" || (key.name === "?" && !context.editingText)) {
    context.toggleHelp();
    return;
  }
  if (key.ctrl && key.name === "l") {
    context.toggleLog();
    return;
  }
  if (key.name === "tab" || shouldMoveFocus(key, context.currentId)) {
    context.moveFocus(key.name === "up" ? -1 : 1);
  }
}

function shouldMoveFocus(key: AppKey, currentId: StepId) {
  return (key.name === "down" || key.name === "up") && !choiceStepIds.has(currentId);
}
