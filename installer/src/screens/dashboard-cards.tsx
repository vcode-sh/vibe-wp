import { TextAttributes } from "@opentui/core";
import { color, type ThemeColor } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { clickProps } from "../components/mouse";
import type { ManageOperation, OpGroupView, OpSafety } from "../core/manage-operations";
import type { TaskStatus } from "../core/task-runner";
import type { InstallerState } from "../core/types";
import { OpDetail } from "./dashboard-detail";

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
      value: state.productionDomain ? `https://${state.productionDomain}` : "Not set",
      tone: "accent2"
    },
    {
      label: "Staging",
      value: state.stagingEnabled ? `https://${state.stagingDomain}` : "Off",
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

export function OpList({
  groups,
  ops,
  current,
  status,
  confirmId,
  set,
  setConfirm
}: {
  groups: OpGroupView[];
  ops: ManageOperation[];
  current: ManageOperation | undefined;
  status: TaskStatus | "idle";
  confirmId: string | null;
  set: (n: number) => void;
  setConfirm: (id: string | null) => void;
}) {
  return (
    <box flexDirection="column" gap={1}>
      <text fg={color("subtle")} height={1} truncate>
        Pick an action below. Nothing happens until you press Enter.
      </text>
      <GroupedOpList
        groups={groups}
        onSelect={(id) => {
          const index = ops.findIndex((op) => op.id === id);
          if (index >= 0) {
            set(index);
            setConfirm(null);
          }
        }}
        selectedId={current?.id}
      />
      <OpDetail confirmPending={confirmId === current?.id} op={current} status={status} />
    </box>
  );
}

export function GroupedOpList({
  groups,
  selectedId,
  onSelect
}: {
  groups: OpGroupView[];
  selectedId: string | undefined;
  // Click only ever selects an op — running stays gated behind Enter so a
  // stray click can never fire a caution/danger operation.
  onSelect?: (id: string) => void;
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
            <OpRow active={op.id === selectedId} key={op.id} onSelect={onSelect} op={op} />
          ))}
        </box>
      ))}
    </box>
  );
}

function OpRow({
  active,
  op,
  onSelect
}: {
  active: boolean;
  op: ManageOperation;
  onSelect?: (id: string) => void;
}) {
  const glyphs = useGlyphs();
  const clickHandlers = onSelect ? clickProps(() => onSelect(op.id)) : {};
  return (
    <box
      alignItems="stretch"
      backgroundColor={active ? color("selectionBg") : undefined}
      flexDirection="row"
      height={1}
      {...clickHandlers}
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
