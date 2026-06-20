import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Credits } from "../components/credits";
import { useGlyphs } from "../components/glyph-context";
import { Panel } from "../components/panel";
import { ActionRow } from "../components/primitives";
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

export function SuccessScreen({ redactedPlan, state }: ScreenProps) {
  const glyphs = useGlyphs();
  const summary = redactedPlan.summary;
  const stagingLive = state.stagingEnabled && summary.stagingUrl !== "disabled";
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <NoteBox tone="success">
        <text attributes={TextAttributes.BOLD} fg={color("success")}>
          {glyphs.done} Your WordPress site is live.
        </text>
        <text fg={color("muted")} wrapMode="word">
          HTTPS, Redis object cache, Nginx page cache, and backups are all set up. Open the links
          below to finish in wp-admin.
        </text>
      </NoteBox>
      <box flexDirection="row" gap={1}>
        <LinkCard label="Your site" tone="accent" url={summary.productionUrl ?? ""} />
        <LinkCard label="Admin login" tone="accent" url={summary.adminUrl ?? ""} />
        {stagingLive && <LinkCard label="Staging" tone="muted" url={summary.stagingUrl ?? ""} />}
      </box>
      <NoteBox tone="info">
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          Next steps
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Log in as "{state.adminUser}" — the password is in{" "}
          {redactedPlan.installDir}/env/prod.env
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Come back here and pick your site to run health checks, backups, updates
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Off-server backups (R2) and alerts can be turned on anytime
        </text>
      </NoteBox>
      <Credits />
    </box>
  );
}

function LinkCard({ label, url, tone }: { label: string; url: string; tone: "accent" | "muted" }) {
  return (
    <box
      backgroundColor={color("panel3")}
      borderColor={color(tone === "accent" ? "accent" : "divider")}
      borderStyle="rounded"
      flexBasis={0}
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
    >
      <text fg={color("muted")}>{label}</text>
      <text
        attributes={TextAttributes.BOLD}
        fg={color(tone === "accent" ? "accent" : "text")}
        truncate
      >
        {url}
      </text>
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
