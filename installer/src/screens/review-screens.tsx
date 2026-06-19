import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Credits } from "../components/credits";
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
        <PlanSummary plan={redactedPlan} />
      )}
      <box flexDirection="row" gap={2}>
        <Panel content={envPaths} maxLines={6} title="ENV FILES" />
        <Panel content={commands} maxLines={6} title="TASKS" />
      </box>
      <Panel content={redactedPlan.caddyfile} maxLines={6} title="CADDYFILE PREVIEW" />
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
        All set — your WordPress site is ready.
      </text>
      <text fg={color("muted")} wrapMode="word">
        Open your site and log in at /wp-admin using the links below. Come back here anytime and
        choose "Manage detected site" to run health checks, backups, and updates.
      </text>
      <InfoGrid rows={Object.entries(redactedPlan.summary)} />
      <NoteBox>
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          Manage it anytime from your server
        </text>
        <text fg={color("muted")}>cd {redactedPlan.installDir}</text>
        <text fg={color("muted")}>./bin/vibe prod smoke</text>
        <text fg={color("muted")}>./bin/vibe prod perf-report</text>
        <text fg={color("muted")}>./bin/vibe prod backup</text>
      </NoteBox>
      <box paddingTop={1}>
        <Credits />
      </box>
    </box>
  );
}

function PlanSummary({ plan }: { plan: ScreenProps["redactedPlan"] }) {
  const staging = plan.domains.stagingEnabled ? `https://${plan.domains.staging}` : "not included";
  return (
    <NoteBox tone="info">
      <text attributes={TextAttributes.BOLD} fg={color("text")} height={1} truncate>
        Here's what we'll set up — nothing runs until you confirm next:
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Your site: https://{plan.domains.production}
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Staging copy: {staging}
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Performance: {plan.summary.performancePreset} · Backups: {plan.summary.backupPolicy}
      </text>
    </NoteBox>
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
