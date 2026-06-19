import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { Panel } from "../components/primitives";
import { Spinner } from "../components/spinner";
import {
  buildOperationTask,
  groupedOperations,
  type ManageOperation,
  type OpSafety
} from "../core/manage-operations";
import { runTask, type TaskStatus } from "../core/task-runner";
import { GroupedOpList, type HealthState, StatusCards } from "./dashboard-cards";

export function DashboardScreen({ state, plan }: ScreenProps) {
  const groups = useMemo(() => groupedOperations(state.stagingEnabled), [state.stagingEnabled]);
  const ops = useMemo(() => groups.flatMap((group) => group.operations), [groups]);
  const [selected, setSelected] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | "idle">("idle");
  const [output, setOutput] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthState>("unknown");
  const current = ops[selected] ?? ops[0];

  async function run(op: ManageOperation) {
    if (op.safety === "danger" && confirmId !== op.id) {
      setConfirmId(op.id);
      return;
    }
    setConfirmId(null);
    setStatus("running");
    setOutput([`Running: ${op.label}…`]);
    const result = await runTask(buildOperationTask(op, state), true, plan);
    setStatus(result.status);
    setOutput((result.output || "Done.").split("\n"));
    if (op.id === "health") {
      setHealth(result.status === "done" ? "healthy" : "problem");
    }
  }

  useKeyboard((key) => {
    if (key.name === "up") {
      setSelected((index) => Math.max(0, index - 1));
      setConfirmId(null);
    } else if (key.name === "down") {
      setSelected((index) => Math.min(ops.length - 1, index + 1));
      setConfirmId(null);
    } else if ((key.name === "return" || key.name === "enter") && current) {
      run(current);
    }
  });

  const site = state.productionDomain || state.selectedSiteDir || "selected site";
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <box flexDirection="row" gap={space.md}>
        <text fg={color("muted")}>Managing</text>
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          {site}
        </text>
      </box>
      <StatusCards health={health} state={state} />
      <text fg={color("subtle")} height={1} truncate>
        Pick an action below. Nothing happens until you press Enter.
      </text>
      <GroupedOpList groups={groups} selectedId={current?.id} />
      <OpDetail confirmPending={confirmId === current?.id} op={current} status={status} />
      {output.length > 0 && <ResultPanel output={output} status={status} />}
    </box>
  );
}

function ResultPanel({ output, status }: { output: string[]; status: TaskStatus | "idle" }) {
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

function OpDetail({
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
        <text attributes={TextAttributes.BOLD} fg={color("danger")} height={1} truncate>
          {glyphs.warn} This changes your live site — press Enter again to confirm.
        </text>
      ) : (
        <text fg={color(status === "failed" ? "danger" : "subtle")} height={1} truncate>
          {statusLine(status, op.safety)}
        </text>
      )}
    </box>
  );
}

function statusLine(status: TaskStatus | "idle", safety: OpSafety): string {
  if (status === "running") {
    return "Working…";
  }
  if (status === "done") {
    return "Done — pick another action or press esc to go back.";
  }
  if (status === "failed") {
    return "That didn't work — see the result below.";
  }
  return safety === "safe" ? "Press Enter to run — this is safe." : "Press Enter to run.";
}
