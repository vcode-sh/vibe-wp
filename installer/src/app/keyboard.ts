import type { StepId } from "./steps";

const choiceStepIds = new Set(["sites", "mode", "performance", "backup"]);

export interface AppKeyContext {
  canGoForward: boolean;
  currentId: StepId;
  destroy: () => void;
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
  if (key.name === "escape" || key.name === "left") {
    context.previous();
    return;
  }
  if (key.name === "tab" || shouldMoveFocus(key, context.currentId)) {
    context.moveFocus(key.name === "up" ? -1 : 1);
    return;
  }
  if (key.name === "right" && context.canGoForward) {
    context.next();
    return;
  }
  if (key.name === "?") {
    context.toggleHelp();
    return;
  }
  if (key.ctrl && key.name === "l") {
    context.toggleLog();
  }
}

function shouldMoveFocus(key: AppKey, currentId: StepId) {
  return (key.name === "down" || key.name === "up") && !choiceStepIds.has(currentId);
}
