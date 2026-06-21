import { TextAttributes } from "@opentui/core";
import { useState } from "react";
import { color, type ThemeColor } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { clickProps } from "../components/mouse";
import type { ManageOperation, OpGroupView, OpSafety } from "../core/manage-operations";
import type { TaskStatus } from "../core/task-runner";
import { OpDetail } from "./dashboard-detail";
import { flattenGroups, windowOpLines } from "./op-window";

const SAFETY_COLOR: Record<OpSafety, ThemeColor> = {
  safe: "success",
  caution: "warning",
  danger: "danger"
};

export function OpList({
  groups,
  ops,
  current,
  status,
  confirmId,
  maxRows,
  showHint = true,
  set,
  setConfirm
}: {
  groups: OpGroupView[];
  ops: ManageOperation[];
  current: ManageOperation | undefined;
  status: TaskStatus | "idle";
  confirmId: string | null;
  maxRows: number;
  showHint?: boolean;
  set: (n: number) => void;
  setConfirm: (id: string | null) => void;
}) {
  return (
    <box flexDirection="column" gap={1}>
      {showHint && (
        <text fg={color("subtle")} height={1} truncate>
          Pick an action below. Nothing happens until you press Enter.
        </text>
      )}
      <GroupedOpList
        groups={groups}
        maxRows={maxRows}
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
  maxRows = Number.POSITIVE_INFINITY,
  onSelect
}: {
  groups: OpGroupView[];
  selectedId: string | undefined;
  // Vertical budget in rows; the list windows around the selection when the
  // full list is taller, so it never overdraws on short terminals.
  maxRows?: number;
  // Click only ever selects an op — running stays gated behind Enter so a
  // stray click can never fire a caution/danger operation.
  onSelect?: (id: string) => void;
}) {
  const { lines, moreUp, moreDown } = windowOpLines(flattenGroups(groups), selectedId, maxRows);
  return (
    <box flexDirection="column">
      <MoreMarker count={moreUp} up />
      {lines.map((line) =>
        line.kind === "header" ? (
          <text
            attributes={TextAttributes.BOLD}
            fg={color(line.danger ? "danger" : "muted")}
            height={1}
            key={line.key}
            truncate
          >
            {line.title}
          </text>
        ) : (
          <OpRow
            active={line.op.id === selectedId}
            key={line.key}
            onSelect={onSelect}
            op={line.op}
          />
        )
      )}
      <MoreMarker count={moreDown} up={false} />
    </box>
  );
}

function MoreMarker({ count, up }: { count: number; up: boolean }) {
  const glyphs = useGlyphs();
  if (count <= 0) {
    return null;
  }
  return (
    <text fg={color("subtle")} height={1} truncate>
      {"  "}
      {up ? glyphs.arrowUp : glyphs.arrowDown} {count} more
    </text>
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
  const [hovered, setHovered] = useState(false);
  const clickHandlers = onSelect ? clickProps(() => onSelect(op.id)) : {};
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI <box> is a terminal renderable; hover mirrors the choice-row affordance so clickable rows are discoverable.
    <box
      alignItems="stretch"
      backgroundColor={active || hovered ? color("selectionBg") : undefined}
      flexDirection="row"
      height={1}
      onMouseOut={() => setHovered(false)}
      onMouseOver={() => setHovered(true)}
      {...clickHandlers}
    >
      <box backgroundColor={active ? color("accentBar") : undefined} flexShrink={0} width={1} />
      <box alignItems="center" flexDirection="row" gap={space.sm} paddingX={1}>
        <text fg={color(SAFETY_COLOR[op.safety])}>
          {op.safety === "safe" ? glyphs.ok : glyphs.warn}
        </text>
        <text
          attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          fg={color(active || hovered ? "text" : "muted")}
          truncate
        >
          {op.label}
        </text>
      </box>
    </box>
  );
}
