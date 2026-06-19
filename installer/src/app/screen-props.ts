import type { Dispatch, SetStateAction } from "react";
import type { InstallerOptions, InstallerState, InstallPlan } from "../core/types";
import type { Step } from "./steps";

export interface ScreenProps {
  compact: boolean;
  current: Step;
  executionLines: string[];
  focusIndex: number;
  next: () => void;
  options: InstallerOptions;
  previous: () => void;
  redactedPlan: InstallPlan;
  setExecutionLines: Dispatch<SetStateAction<string[]>>;
  setFocusIndex: (index: number) => void;
  state: InstallerState;
  update: <K extends keyof InstallerState>(key: K, value: InstallerState[K]) => void;
  validationErrors: string[];
}
