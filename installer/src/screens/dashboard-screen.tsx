import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import {
  buildBackupsListTask,
  buildOperationTask,
  groupedOperations,
  type ManageOperation
} from "../core/manage-operations";
import { runTask, type TaskStatus } from "../core/task-runner";
import { GroupedOpList, type HealthState, StatusCards } from "./dashboard-cards";
import { BackupPicker, OpDetail, ResultPanel } from "./dashboard-detail";

const SANDBOX_BACKUPS = [
  "backups/prod/20260618T090000Z",
  "backups/prod/20260619T120000Z-pre-update"
];

interface RestoreState {
  index: number;
  items: string[];
  op: ManageOperation;
}

export function DashboardScreen({ state, plan }: ScreenProps) {
  const groups = useMemo(() => groupedOperations(state.stagingEnabled), [state.stagingEnabled]);
  const ops = useMemo(() => groups.flatMap((group) => group.operations), [groups]);
  const [selected, setSelected] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | "idle">("idle");
  const [output, setOutput] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthState>("unknown");
  const [restore, setRestore] = useState<RestoreState | null>(null);
  const current = ops[selected] ?? ops[0];

  async function fetchBackups(): Promise<string[]> {
    if (state.localSandbox) {
      return SANDBOX_BACKUPS;
    }
    const res = await runTask(buildBackupsListTask("prod", state), true, plan);
    return res.output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async function openRestore(op: ManageOperation) {
    setStatus("running");
    setOutput(["Loading backups…"]);
    const backups = await fetchBackups();
    setStatus("idle");
    setOutput([]);
    if (backups.length === 0) {
      setStatus("failed");
      setOutput(['No backups found yet — run "Back up now" first.']);
      return;
    }
    setRestore({ op, items: ["Cancel", ...backups], index: 0 });
  }

  async function runOp(op: ManageOperation, backupPath?: string) {
    setRestore(null);
    setConfirmId(null);
    setStatus("running");
    setOutput([`Running: ${op.label}…`]);
    const result = await runTask(buildOperationTask(op, state, backupPath), true, plan);
    setStatus(result.status);
    setOutput((result.output || "Done.").split("\n"));
    if (op.id === "health") {
      setHealth(result.status === "done" ? "healthy" : "problem");
    }
  }

  function activate(op: ManageOperation) {
    if (op.needsBackup) {
      openRestore(op);
      return;
    }
    if (op.safety === "danger" && confirmId !== op.id) {
      setConfirmId(op.id);
      return;
    }
    runOp(op);
  }

  useKeyboard((key) => {
    if (restore) {
      handleRestoreKey(key, restore, setRestore, runOp);
      return;
    }
    if (key.name === "up") {
      setSelected((index) => Math.max(0, index - 1));
      setConfirmId(null);
    } else if (key.name === "down") {
      setSelected((index) => Math.min(ops.length - 1, index + 1));
      setConfirmId(null);
    } else if ((key.name === "return" || key.name === "enter") && current) {
      activate(current);
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
      {restore ? (
        <BackupPicker index={restore.index} items={restore.items} />
      ) : (
        <OpList
          confirmId={confirmId}
          current={current}
          groups={groups}
          ops={ops}
          set={setSelected}
          setConfirm={setConfirmId}
          status={status}
        />
      )}
      {output.length > 0 && <ResultPanel output={output} status={status} />}
    </box>
  );
}

function OpList({
  groups,
  ops,
  current,
  status,
  confirmId,
  set,
  setConfirm
}: {
  groups: ReturnType<typeof groupedOperations>;
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

function handleRestoreKey(
  key: { name: string },
  restore: RestoreState,
  setRestore: (r: RestoreState | null) => void,
  runOp: (op: ManageOperation, backupPath?: string) => void
) {
  if (key.name === "up") {
    setRestore({ ...restore, index: Math.max(0, restore.index - 1) });
  } else if (key.name === "down") {
    setRestore({ ...restore, index: Math.min(restore.items.length - 1, restore.index + 1) });
  } else if (key.name === "return" || key.name === "enter") {
    if (restore.index === 0) {
      setRestore(null);
    } else {
      runOp(restore.op, restore.items[restore.index]);
    }
  }
}
