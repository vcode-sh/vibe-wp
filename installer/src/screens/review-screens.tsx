import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { InfoGrid } from "../components/data-display";
import { ActionRow, Panel } from "../components/primitives";
import { NoteBox } from "../components/section";

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
        primary="Open execution"
        secondary="Execution is blocked until confirmation"
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
      <NoteBox>
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          Daily commands after install
        </text>
        <text fg={color("muted")}>cd {redactedPlan.installDir}</text>
        <text fg={color("muted")}>./bin/vibe prod smoke</text>
        <text fg={color("muted")}>./bin/vibe prod perf-report</text>
        <text fg={color("muted")}>./bin/vibe prod backup</text>
      </NoteBox>
    </box>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  return (
    <NoteBox tone="danger">
      <text attributes={TextAttributes.BOLD} fg={color("danger")}>
        Fix before running
      </text>
      <text fg={color("text")} wrapMode="word">
        {errors.join("\n")}
      </text>
    </NoteBox>
  );
}
