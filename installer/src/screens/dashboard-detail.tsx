import { TextAttributes } from "@opentui/core";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { Panel } from "../components/primitives";
import { Spinner } from "../components/spinner";
import type { ManageOperation } from "../core/manage-operations";
import type { TaskStatus } from "../core/task-runner";

export function ResultPanel({ output, status }: { output: string[]; status: TaskStatus | "idle" }) {
  return (
    <box flexDirection="column" gap={space.xs}>
      <ResultBadge status={status} />
      <Panel content={output.join("\n")} maxLines={8} title="RESULT" />
    </box>
  );
}

function ResultBadge({ status }: { status: TaskStatus | "idle" }) {
  if (status === "running") {
    return (
      <box alignItems="center" flexDirection="row" gap={space.sm} height={1}>
        <Spinner />
        <text fg={color("muted")}>Working…</text>
      </box>
    );
  }
  if (status !== "done" && status !== "failed") {
    return null;
  }
  const failed = status === "failed";
  return (
    <box flexDirection="row" height={1}>
      <box backgroundColor={color(failed ? "danger" : "success")} paddingX={1}>
        <text attributes={TextAttributes.BOLD} fg={color("black")}>
          {failed ? "Failed" : "Done"}
        </text>
      </box>
    </box>
  );
}

export function OpDetail({
  op,
  status,
  confirmPending
}: {
  op: ManageOperation | undefined;
  status: TaskStatus | "idle";
  confirmPending: boolean;
}) {
  const glyphs = useGlyphs();
  if (!op) {
    return null;
  }
  return (
    <box flexDirection="column" gap={space.xs} paddingX={1}>
      <text fg={color("muted")} height={1} truncate>
        {op.description}
      </text>
      {confirmPending ? (
        <box flexDirection="column">
          <text fg={color("danger")} wrapMode="word">
            {glyphs.warn} {op.consequence ?? "This changes your live site."}
          </text>
          <text attributes={TextAttributes.BOLD} fg={color("danger")}>
            Press Enter again to confirm, or Esc to cancel.
          </text>
        </box>
      ) : (
        <text fg={color(status === "failed" ? "danger" : "subtle")} height={1} truncate>
          {statusLine(status, op)}
        </text>
      )}
    </box>
  );
}

function statusLine(status: TaskStatus | "idle", op: ManageOperation): string {
  if (status === "running") {
    return "Working…";
  }
  if (status === "done") {
    return "Done — pick another action or press esc to go back.";
  }
  if (status === "failed") {
    return "That didn't work — see the result below.";
  }
  if (op.needsBackup) {
    return "Press Enter to choose a backup to restore.";
  }
  return op.safety === "safe" ? "Press Enter to run — this is safe." : "Press Enter to run.";
}

// Restore picker: a small list whose first row is always "Cancel" so the owner
// can back out without touching their live site.
export function BackupPicker({ items, index }: { items: string[]; index: number }) {
  const glyphs = useGlyphs();
  return (
    <box flexDirection="column" gap={space.xs}>
      <text attributes={TextAttributes.BOLD} fg={color("danger")} height={1} truncate>
        {glyphs.warn} Restoring replaces your live site. Pick a backup, or Cancel:
      </text>
      {items.map((item, i) => (
        <PickerRow
          active={i === index}
          cancel={i === 0}
          // biome-ignore lint/suspicious/noArrayIndexKey: list is positional
          key={`${item}-${i}`}
          label={item}
        />
      ))}
    </box>
  );
}

function PickerRow({ active, cancel, label }: { active: boolean; cancel: boolean; label: string }) {
  const tone: Parameters<typeof color>[0] = cancel ? "muted" : "text";
  return (
    <box
      alignItems="stretch"
      backgroundColor={active ? color("selectionBg") : undefined}
      flexDirection="row"
      height={1}
    >
      <box backgroundColor={active ? color("accentBar") : undefined} flexShrink={0} width={1} />
      <box flexDirection="row" paddingX={1}>
        <text
          attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          fg={color(active ? "text" : tone)}
          truncate
        >
          {label}
        </text>
      </box>
    </box>
  );
}
