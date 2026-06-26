import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Credits } from "../components/credits";
import { useGlyphs } from "../components/glyph-context";
import { Panel } from "../components/panel";
import { ActionRow } from "../components/primitives";
import { NoteBox } from "../components/section";
import { advancedOverrideWarnings } from "../core/advanced-overrides";
import { shortPath } from "../core/site-profile";
import { PanelPlanSummary, PanelSuccess } from "./panel-result";

export function ReviewScreen({ redactedPlan, state, validationErrors, next }: ScreenProps) {
  const isPanel = state.mode === "panel-bootstrap";
  const overrideWarnings = advancedOverrideWarnings(state);
  // Half-width panel: keep just env/<file> so it never truncates; the site is
  // already named in the plan summary above.
  const envPaths = redactedPlan.envFiles.map((env) => shortPath(env.path, 2)).join("\n");
  const commands = redactedPlan.tasks
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join("\n");
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <ReviewSummary isPanel={isPanel} plan={redactedPlan} validationErrors={validationErrors} />
      <box flexDirection="row" gap={2}>
        {!isPanel && <Panel content={envPaths} maxLines={6} title="ENV FILES" />}
        <Panel content={commands} maxLines={6} title="TASKS" />
      </box>
      {!isPanel && (
        <Panel content={redactedPlan.caddyfile} maxLines={6} title="CADDYFILE PREVIEW" />
      )}
      {overrideWarnings.length > 0 && <AdvancedOverrideWarningList state={state} />}
      <ActionRow
        onPrimary={next}
        primary="Open execution"
        secondary="Execution is blocked until confirmation"
      />
    </box>
  );
}

function AdvancedOverrideWarningList({ state }: { state: ScreenProps["state"] }) {
  const warnings = advancedOverrideWarnings(state);
  if (warnings.length === 0) {
    return null;
  }
  return (
    <NoteBox tone="danger">
      <text attributes={TextAttributes.BOLD} fg={color("danger")}>
        Advanced override checkpoint
      </text>
      <text fg={color("text")} wrapMode="word">
        {warnings.map((item) => `${item.label}: ${item.consequence}`).join("\n")}
      </text>
    </NoteBox>
  );
}

function ReviewSummary({
  isPanel,
  plan,
  validationErrors
}: {
  isPanel: boolean;
  plan: ScreenProps["redactedPlan"];
  validationErrors: string[];
}) {
  if (validationErrors.length > 0) {
    return <ValidationErrors errors={validationErrors} />;
  }
  if (isPanel) {
    return <PanelPlanSummary plan={plan} />;
  }
  return <PlanSummary plan={plan} />;
}

export function SuccessScreen({ redactedPlan, state }: ScreenProps) {
  const glyphs = useGlyphs();
  const { width } = useTerminalDimensions();
  const summary = redactedPlan.summary;
  if (state.mode === "panel-bootstrap") {
    return <PanelSuccess email={state.adminEmail} panelUrl={summary.panelUrl ?? ""} />;
  }
  const stagingLive = state.stagingEnabled && summary.stagingUrl !== "disabled";
  // Three link cards in a row truncate their URLs (admin URLs run ~32 chars)
  // unless the panel is very wide; stack them otherwise so each shows in full.
  const innerWidth = width < 92 ? width - 8 : width - 30;
  const stack = innerWidth < 100;
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
      <box flexDirection={stack ? "column" : "row"} gap={1}>
        <LinkCard label="Your site" stack={stack} tone="accent" url={summary.productionUrl ?? ""} />
        <LinkCard label="Admin login" stack={stack} tone="accent" url={summary.adminUrl ?? ""} />
        {stagingLive && (
          <LinkCard label="Staging" stack={stack} tone="muted" url={summary.stagingUrl ?? ""} />
        )}
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

function LinkCard({
  label,
  url,
  tone,
  stack = false
}: {
  label: string;
  url: string;
  tone: "accent" | "muted";
  stack?: boolean;
}) {
  return (
    <box
      backgroundColor={color("panel3")}
      borderColor={color(tone === "accent" ? "accent" : "divider")}
      borderStyle="rounded"
      flexBasis={stack ? undefined : 0}
      flexDirection="column"
      flexGrow={stack ? 0 : 1}
      paddingX={1}
    >
      <text fg={color("muted")} height={1} truncate>
        {label}
      </text>
      <text
        attributes={TextAttributes.BOLD}
        fg={color(tone === "accent" ? "accent" : "text")}
        height={1}
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
