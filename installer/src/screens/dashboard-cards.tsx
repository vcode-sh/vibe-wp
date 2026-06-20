import { TextAttributes } from "@opentui/core";
import { color, type ThemeColor } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import type { InstallerState } from "../core/types";

// Health is only known once the owner runs the health check — never auto-run.
export type HealthState = "unknown" | "healthy" | "problem";

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

const backupStampPattern = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/;

function backupCard(lastBackup: string | null | undefined): CardSpec {
  if (lastBackup === null || lastBackup === undefined) {
    return { label: "Last backup", value: "checking…", tone: "muted" };
  }
  const match = lastBackup.match(backupStampPattern);
  if (!match) {
    return { label: "Last backup", value: "none yet", tone: "warning" };
  }
  const n = (index: number) => Number(match[index] ?? "0");
  const when = Date.UTC(n(1), n(2) - 1, n(3), n(4), n(5), n(6));
  const hours = Math.floor((Date.now() - when) / 3_600_000);
  return { label: "Last backup", value: agoLabel(hours), tone: hours > 48 ? "warning" : "success" };
}

function agoLabel(hours: number): string {
  if (hours < 1) {
    return "under 1h ago";
  }
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function StatusCards({
  health,
  state,
  lastBackup
}: {
  health: HealthState;
  state: InstallerState;
  lastBackup?: string | null;
}) {
  const glyphs = useGlyphs();
  const cards: CardSpec[] = [
    {
      label: "Live site",
      value: state.productionDomain || "Not set",
      tone: "accent2"
    },
    {
      label: "Staging",
      value: state.stagingEnabled ? state.stagingDomain : "Off",
      tone: state.stagingEnabled ? "success" : "muted"
    },
    backupCard(lastBackup),
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
