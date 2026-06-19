import { TextAttributes } from "@opentui/core";
import { color, type ThemeColor } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import type { ManageOperation, OpGroupView, OpSafety } from "../core/manage-operations";
import type { InstallerState } from "../core/types";

// Health is only known once the owner runs the health check — never auto-run.
export type HealthState = "unknown" | "healthy" | "problem";

const SAFETY_COLOR: Record<OpSafety, ThemeColor> = {
  safe: "success",
  caution: "warning",
  danger: "danger"
};

interface CardSpec {
  label: string;
  tone: ThemeColor;
  value: string;
}

function healthCard(health: HealthState, glyphs: Record<string, string>): CardSpec {
  if (health === "healthy") {
    return { label: "Health", value: `Healthy ${glyphs.done}`, tone: "success" };
  }
  if (health === "problem") {
    return { label: "Health", value: `Problem ${glyphs.missing}`, tone: "danger" };
  }
  return { label: "Health", value: "Not checked yet", tone: "muted" };
}

export function StatusCards({ health, state }: { health: HealthState; state: InstallerState }) {
  const glyphs = useGlyphs();
  const cards: CardSpec[] = [
    {
      label: "Live site",
      value: state.productionDomain ? `https://${state.productionDomain}` : "Not set",
      tone: "accent2"
    },
    {
      label: "Staging",
      value: state.stagingEnabled ? "On" : "Off",
      tone: state.stagingEnabled ? "success" : "muted"
    },
    {
      label: "Install folder",
      value: state.selectedSiteDir || state.installDir || "Unknown",
      tone: "muted"
    },
    healthCard(health, glyphs)
  ];
  return (
    <box flexDirection="row" gap={space.sm}>
      {cards.map((card) => (
        <StatusCard card={card} key={card.label} />
      ))}
    </box>
  );
}

function StatusCard({ card }: { card: CardSpec }) {
  return (
    <box backgroundColor={color("panel3")} flexBasis={0} flexGrow={1} paddingX={1}>
      <text fg={color("subtle")} height={1} truncate>
        {card.label}
      </text>
      <text attributes={TextAttributes.BOLD} fg={color(card.tone)} height={1} truncate>
        {card.value}
      </text>
    </box>
  );
}

export function GroupedOpList({
  groups,
  selectedId
}: {
  groups: OpGroupView[];
  selectedId: string | undefined;
}) {
  return (
    <box flexDirection="column" gap={space.sm}>
      {groups.map((group) => (
        <box flexDirection="column" key={group.group}>
          <text
            attributes={TextAttributes.BOLD}
            fg={color(group.group === "danger" ? "danger" : "muted")}
            height={1}
            truncate
          >
            {group.title}
          </text>
          {group.operations.map((op) => (
            <OpRow active={op.id === selectedId} key={op.id} op={op} />
          ))}
        </box>
      ))}
    </box>
  );
}

function OpRow({ active, op }: { active: boolean; op: ManageOperation }) {
  const glyphs = useGlyphs();
  return (
    <box
      alignItems="stretch"
      backgroundColor={active ? color("selectionBg") : undefined}
      flexDirection="row"
      height={1}
    >
      <box backgroundColor={active ? color("accentBar") : undefined} flexShrink={0} width={1} />
      <box alignItems="center" flexDirection="row" gap={space.sm} paddingX={1}>
        <text fg={color(SAFETY_COLOR[op.safety])}>
          {op.safety === "safe" ? glyphs.ok : glyphs.warn}
        </text>
        <text
          attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          fg={color(active ? "text" : "muted")}
          truncate
        >
          {op.label}
        </text>
      </box>
    </box>
  );
}
