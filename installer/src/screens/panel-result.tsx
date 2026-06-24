import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { Credits } from "../components/credits";
import { useGlyphs } from "../components/glyph-context";
import { NoteBox } from "../components/section";

// Panel-bootstrap variants of the Review/Success summaries. The shared
// Review/Success screens are site-install-shaped; the panel flow shows host
// prep + the panel URL instead of a WordPress site.

export function PanelPlanSummary({ plan }: { plan: ScreenProps["redactedPlan"] }) {
  return (
    <NoteBox tone="info">
      <text attributes={TextAttributes.BOLD} fg={color("text")} height={1} truncate>
        Here's what we'll set up — nothing runs until you confirm next:
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Install Docker, Caddy and Bun on this server
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Deploy the control panel at {plan.summary.panelUrl}
      </text>
      <text fg={color("muted")} height={1} truncate>
        · Create your owner login so you can sign in right away
      </text>
    </NoteBox>
  );
}

export function PanelSuccess({ panelUrl, email }: { panelUrl: string; email: string }) {
  const glyphs = useGlyphs();
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <NoteBox tone="success">
        <text attributes={TextAttributes.BOLD} fg={color("success")}>
          {glyphs.done} Your control panel is live.
        </text>
        <text fg={color("muted")} wrapMode="word">
          Open it in a browser and sign in. Then create your first WordPress site — right from the
          panel.
        </text>
      </NoteBox>
      <box
        backgroundColor={color("panel3")}
        borderColor={color("accent")}
        borderStyle="rounded"
        flexDirection="column"
        paddingX={1}
      >
        <text fg={color("muted")} height={1} truncate>
          Control panel
        </text>
        <text attributes={TextAttributes.BOLD} fg={color("accent")} height={1} truncate>
          {panelUrl}
        </text>
      </box>
      <NoteBox tone="info">
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          Next steps
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Sign in as "{email}" with the password you just set
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Click "Create your first site" to launch WordPress
        </text>
        <text fg={color("muted")} wrapMode="word">
          {glyphs.bullet} Manage everything — backups, updates, staging — from here
        </text>
      </NoteBox>
      <Credits />
    </box>
  );
}
