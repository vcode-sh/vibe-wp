import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ActionRow, InfoGrid, Panel } from "../components/primitives";

export function ReviewScreen({ redactedPlan, validationErrors, next }: ScreenProps) {
  const envPaths = redactedPlan.envFiles.map((env) => env.path).join("\n");
  const commands = redactedPlan.tasks
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join("\n");
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      {validationErrors.length > 0 ? (
        <ValidationErrors errors={validationErrors} />
      ) : (
        <text attributes={TextAttributes.BOLD} fg={color("success")}>
          Plan is valid. Review before execution.
        </text>
      )}
      <box flexDirection="row" flexGrow={1} gap={1}>
        <Panel content={envPaths} title="ENV FILES" />
        <Panel content={commands} title="TASKS" />
      </box>
      <Panel content={redactedPlan.caddyfile} title="CADDYFILE PREVIEW" />
      <ActionRow
        onPrimary={next}
        primary="Execute preview"
        secondary="Run with --yes to apply commands"
      />
    </box>
  );
}

export function ExecuteScreen({
  redactedPlan,
  executionLines,
  setExecutionLines,
  next,
  options
}: ScreenProps) {
  const lines = executionLines.length > 12 ? executionLines.slice(-12) : executionLines;
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text attributes={TextAttributes.BOLD} fg={options.yes ? color("warning") : color("accent")}>
        {options.yes
          ? "Ready to run real host commands."
          : "Dry execution preview. No host changes will be made."}
      </text>
      <scrollbox
        backgroundColor={color("panel")}
        border
        borderColor={color("border")}
        flexGrow={1}
        padding={1}
      >
        <box flexDirection="column" gap={1}>
          {redactedPlan.tasks.map((task, index) => (
            <box flexDirection="row" gap={1} key={task.id}>
              <text fg={color("accent")}>{String(index + 1).padStart(2, "0")}</text>
              <text fg={color("text")} truncate>
                {task.title}
              </text>
              <text fg={task.privileged ? color("warning") : color("muted")}>
                {task.privileged ? "privileged" : "safe"}
              </text>
            </box>
          ))}
        </box>
      </scrollbox>
      <Panel content={lines.join("\n")} title="LATEST LOG" />
      <ActionRow
        onPrimary={() => {
          setExecutionLines((previous) => [
            ...previous,
            "Interactive execution preview completed.",
            "Use --export-plan and --headless for non-interactive execution."
          ]);
          next();
        }}
        primary={options.yes ? "I reviewed it; continue to success screen" : "Preview accepted"}
        secondary="Real task runner is available through --headless plan.json --yes"
      />
    </box>
  );
}

export function SuccessScreen({ redactedPlan }: ScreenProps) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text attributes={TextAttributes.BOLD} fg={color("success")}>
        Vibe WP installer plan is ready.
      </text>
      <InfoGrid rows={Object.entries(redactedPlan.summary)} />
      <box
        backgroundColor={color("panel")}
        border
        borderColor={color("border")}
        flexDirection="column"
        padding={1}
      >
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          Daily commands after install
        </text>
        <text fg={color("muted")}>cd {redactedPlan.installDir}</text>
        <text fg={color("muted")}>./bin/vibe prod smoke</text>
        <text fg={color("muted")}>./bin/vibe prod perf-report</text>
        <text fg={color("muted")}>./bin/vibe prod backup</text>
      </box>
    </box>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  return (
    <box
      backgroundColor={color("panel")}
      border
      borderColor={color("danger")}
      flexDirection="column"
      padding={1}
    >
      <text attributes={TextAttributes.BOLD} fg={color("danger")}>
        Fix before running
      </text>
      <text fg={color("text")} wrapMode="word">
        {errors.join("\n")}
      </text>
    </box>
  );
}
