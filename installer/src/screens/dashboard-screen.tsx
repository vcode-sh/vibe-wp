import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { groupedOperations, type ManageOperation } from "../core/manage-operations";
import {
  buildBackupsListTask,
  buildOperationTask,
  buildRemoteBackupsListTask
} from "../core/manage-tasks";
import { runTask, type TaskStatus } from "../core/task-runner";
import { type HealthState, StatusCards } from "./dashboard-cards";
import { BackupPicker, ResultPanel } from "./dashboard-detail";
import { OpList } from "./op-list";

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
  const glyphs = useGlyphs();
  const { width, height } = useTerminalDimensions();
  const groups = useMemo(() => groupedOperations(state.stagingEnabled), [state.stagingEnabled]);
  const ops = useMemo(() => groups.flatMap((group) => group.operations), [groups]);
  const [selected, setSelected] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | "idle">("idle");
  const [output, setOutput] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthState>("unknown");
  const [restore, setRestore] = useState<RestoreState | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const current = ops[selected] ?? ops[0];

  // Best-effort: load the newest local backup once, for an at-a-glance card.
  useEffect(() => {
    if (state.localSandbox) {
      return;
    }
    let alive = true;
    runTask(buildBackupsListTask("prod", state), true, plan).then((res) => {
      const paths = res.output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (alive) {
        setLastBackup(paths.at(-1) ?? "");
      }
    });
    return () => {
      alive = false;
    };
  }, [plan, state]);

  async function fetchBackups(): Promise<string[]> {
    if (state.localSandbox) {
      return SANDBOX_BACKUPS;
    }
    const parse = (text: string): string[] =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const localRes = await runTask(buildBackupsListTask("prod", state), true, plan);
    const local = parse(localRes.output);
    // Merge in off-server (R2) backups not present locally; restore auto-fetches them.
    const remoteRes = await runTask(buildRemoteBackupsListTask("prod", state), true, plan);
    const localSet = new Set(local);
    const remoteOnly = parse(remoteRes.output).filter((path) => !localSet.has(path));
    return [...local, ...remoteOnly];
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
  const detected = state.host.existingSites.find((s) => s.installDir === state.selectedSiteDir);
  const running = detected?.running ?? true;
  // On short terminals the status cards cost rows the action list needs more —
  // hide them so the actual controls stay fully visible and never overdraw.
  const tight = height < 32;
  // Four cards in a row truncate a long staging domain unless the panel is very
  // wide; below ~108 inner columns lay them out 2×2 instead (one extra row).
  const innerWidth = width < 92 ? width - 8 : width - 30;
  const twoPerRow = innerWidth < 108;
  const resultRows = output.length > 0 ? Math.min(8, output.length) + 3 : 0;
  const maxRows = Math.max(3, height - dashboardChrome(tight, twoPerRow) - resultRows);
  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <box alignItems="center" flexDirection="row" gap={space.md}>
        <text fg={color(running ? "success" : "warning")}>
          {running ? glyphs.ok : glyphs.pending} {running ? "running" : "stopped"}
        </text>
        <text attributes={TextAttributes.BOLD} fg={color("text")}>
          {site}
        </text>
        {state.stagingEnabled && <text fg={color("muted")}>· staging</text>}
      </box>
      {!tight && (
        <StatusCards health={health} lastBackup={lastBackup} state={state} twoPerRow={twoPerRow} />
      )}
      {restore ? (
        <BackupPicker
          index={restore.index}
          items={restore.items}
          onPick={(i) => setRestore((r) => (r ? { ...r, index: i } : r))}
        />
      ) : (
        <OpList
          confirmId={confirmId}
          current={current}
          groups={groups}
          maxRows={maxRows}
          ops={ops}
          set={setSelected}
          setConfirm={setConfirmId}
          showHint={!tight}
          status={status}
        />
      )}
      {output.length > 0 && <ResultPanel output={output} status={status} />}
    </box>
  );
}

// Rows consumed by everything except the operations list, so it can size to fit.
function dashboardChrome(tight: boolean, twoPerRow: boolean): number {
  if (tight) {
    return 19;
  }
  return twoPerRow ? 24 : 23;
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
