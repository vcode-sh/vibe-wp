import { color } from "../app/theme";
import type { TaskResult } from "../core/task-runner";

export type ExecuteStatus = "idle" | "running" | "done" | "failed";

export function executionTitle(status: ExecuteStatus, validationCount: number): string {
  if (validationCount > 0) {
    return "Execution is blocked until the review errors are fixed.";
  }
  if (status === "running") {
    return "Installing Vibe WP now. Keep this SSH session open.";
  }
  if (status === "done") {
    return "Installation finished. Review the final URLs.";
  }
  if (status === "failed") {
    return "Installation stopped. Latest log explains the failing task.";
  }
  return "Ready to run real host commands after typed confirmation.";
}

export function primaryLabel(status: ExecuteStatus, failed?: TaskResult): string {
  if (status === "running") {
    return "Running";
  }
  if (status === "done" && !failed) {
    return "Open success screen";
  }
  if (status === "failed") {
    return "Retry failed install";
  }
  return "Run installation";
}

export function secondaryLabel(
  status: string,
  confirmationAccepted: boolean,
  validationCount: number
): string {
  if (validationCount > 0) {
    return "Go back and fix blocked fields";
  }
  if (status === "running") {
    return "Do not close this terminal";
  }
  if (!confirmationAccepted) {
    return "Typed confirmation prevents accidental host changes";
  }
  return "DNS preflight runs before package installs";
}

export function statusTone(status: ExecuteStatus, validationCount: number): string {
  if (validationCount > 0 || status === "failed") {
    return color("danger");
  }
  if (status === "done") {
    return color("success");
  }
  if (status === "running") {
    return color("warning");
  }
  return color("accent");
}

export function taskTone(result: TaskResult | undefined, privileged: boolean | undefined): string {
  if (result?.status === "done") {
    return color("success");
  }
  if (result?.status === "failed") {
    return color("danger");
  }
  return privileged ? color("warning") : color("muted");
}
