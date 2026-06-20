import type { ManageOperation, OpGroupView } from "../core/manage-operations";

// A single rendered line in the operations list: either a group header or an
// operation row. Flattening groups into lines lets us window a tall list down
// to whatever vertical space the terminal actually has.
export type OpLine =
  | { kind: "header"; key: string; title: string; danger: boolean }
  | { kind: "op"; key: string; op: ManageOperation };

export interface OpWindow {
  lines: OpLine[];
  moreDown: number;
  moreUp: number;
}

export function flattenGroups(groups: OpGroupView[]): OpLine[] {
  const lines: OpLine[] = [];
  for (const group of groups) {
    lines.push({
      kind: "header",
      key: `h:${group.group}`,
      title: group.title,
      danger: group.group === "danger"
    });
    for (const op of group.operations) {
      lines.push({ kind: "op", key: op.id, op });
    }
  }
  return lines;
}

function opCount(lines: OpLine[]): number {
  return lines.filter((line) => line.kind === "op").length;
}

// Returns the slice of lines to render so the selected operation stays visible,
// plus how many operations are hidden above/below (for "N more" markers). When
// the whole list fits, everything is returned and both counts are zero.
export function windowOpLines(
  lines: OpLine[],
  selectedId: string | undefined,
  maxRows: number
): OpWindow {
  if (lines.length <= maxRows || maxRows <= 0) {
    return { lines, moreUp: 0, moreDown: 0 };
  }
  // Reserve up to two rows for the up/down markers.
  const content = Math.max(1, maxRows - 2);
  const selected = Math.max(
    0,
    lines.findIndex((line) => line.kind === "op" && line.op.id === selectedId)
  );
  let start = selected - Math.floor(content / 2);
  start = Math.max(0, Math.min(start, lines.length - content));
  // Pull the window up onto the selected group's header for context, but only
  // when doing so keeps the selected row visible within the budget.
  if (start > 0 && lines[start]?.kind === "op") {
    const headerIndex = findHeaderBefore(lines, start);
    if (headerIndex >= 0 && selected < headerIndex + content) {
      start = headerIndex;
    }
  }
  const end = start + content;
  return {
    lines: lines.slice(start, end),
    moreUp: opCount(lines.slice(0, start)),
    moreDown: opCount(lines.slice(end))
  };
}

function findHeaderBefore(lines: OpLine[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (lines[i]?.kind === "header") {
      return i;
    }
  }
  return -1;
}
