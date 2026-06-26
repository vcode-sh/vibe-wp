import { TextAttributes } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { space } from "../app/tokens";
import { Panel } from "../components/panel";
import { ActionRow, Field } from "../components/primitives";
import { ProgressBar, Spinner } from "../components/spinner";
import { buildInstallSummaryLines } from "../core/install-summary";
import { runPlan } from "../core/plan-runner";
import type { TaskResult } from "../core/task-runner";
import {
  confirmationPhraseFor,
  type ExecuteStatus,
  executionTitle,
  primaryLabel,
  secondaryLabel,
  statusTone,
  taskTone
} from "./execute-labels";

export function ExecuteScreen({
  plan,
  redactedPlan,
  executionLines,
  setExecutionLines,
  next,
  options,
  state,
  validationErrors
}: ScreenProps) {
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<ExecuteStatus>("idle");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  // Live elapsed timer while installing, so a long install never feels stuck.
  useEffect(() => {
    if (status !== "running") {
      return;
    }
    const id = setInterval(() => {
      if (startedAt.current) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status]);
  const lines = executionLines.length > 12 ? executionLines.slice(-12) : executionLines;
  const confirmationPhrase = confirmationPhraseFor(state);
  const confirmationAccepted =
    options.yes || confirmation.trim().toLowerCase() === confirmationPhrase.toLowerCase();
  const failed = results.find((result) => result.status === "failed");
  const latestResults = results.slice(-8);

  async function execute() {
    if (status === "done" && !failed) {
      next();
      return;
    }
    if (status === "running") {
      return;
    }
    if (validationErrors.length > 0) {
      appendLog(setExecutionLines, [
        "Execution blocked by validation errors.",
        ...validationErrors
      ]);
      return;
    }
    if (!confirmationAccepted) {
      appendLog(setExecutionLines, [
        `Type ${confirmationPhrase} before running privileged commands.`
      ]);
      return;
    }

    setStatus("running");
    setResults([]);
    startedAt.current = Date.now();
    setElapsed(0);
    appendLog(setExecutionLines, [
      `Starting real installation for ${state.productionDomain.trim().toLowerCase()}.`
    ]);

    try {
      const taskResults = await runPlan(plan, true, {
        onTaskResult: (task, result, index) => {
          setResults((previous) => [...previous, result]);
          appendLog(setExecutionLines, [
            `${index + 1}/${plan.tasks.length} ${task.id}: ${result.status}`,
            result.output || "No output."
          ]);
        },
        onTaskStart: (task, index) => {
          appendLog(setExecutionLines, [`${index + 1}/${plan.tasks.length} ${task.id}: running`]);
        }
      });
      const hasFailure = taskResults.some((result) => result.status === "failed");
      setStatus(hasFailure ? "failed" : "done");
      appendLog(setExecutionLines, [
        hasFailure ? "Installation stopped after a failed task." : "Installation completed.",
        ...buildInstallSummaryLines(plan, taskResults)
      ]);
    } catch (error) {
      setStatus("failed");
      appendLog(setExecutionLines, [error instanceof Error ? error.message : String(error)]);
    }
  }

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <box alignItems="center" flexDirection="row" gap={space.sm}>
        {status === "running" && <Spinner />}
        <text attributes={TextAttributes.BOLD} fg={statusTone(status, validationErrors.length)}>
          {executionTitle(status, validationErrors.length)}
        </text>
        {(status === "running" || status === "done") && (
          <text fg={color("muted")}>
            · {results.length}/{plan.tasks.length} steps · {formatElapsed(elapsed)}
          </text>
        )}
      </box>
      {(status === "running" || status === "done") && (
        <ProgressBar total={plan.tasks.length} value={results.length} />
      )}
      <TaskList results={results} tasks={redactedPlan.tasks} />
      {latestResults.length > 0 && <ResultPanel results={latestResults} />}
      {!options.yes && (
        <Field
          feedback={
            confirmationAccepted
              ? { tone: "ok", text: "Confirmed — press Enter to begin." }
              : { tone: "warn", text: "Safety check: type the line above exactly to confirm." }
          }
          focused
          label={`Type ${confirmationPhrase}`}
          onInput={setConfirmation}
          value={confirmation}
        />
      )}
      <Panel content={lines.join("\n")} maxLines={5} title="LATEST LOG" />
      <ActionRow
        onPrimary={() => {
          execute();
        }}
        primary={primaryLabel(status, failed)}
        secondary={secondaryLabel(status, confirmationAccepted, validationErrors.length)}
      />
    </box>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function TaskList({
  tasks,
  results
}: {
  results: TaskResult[];
  tasks: ScreenProps["redactedPlan"]["tasks"];
}) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  return (
    <scrollbox
      backgroundColor={color("panel")}
      borderColor={color("border")}
      borderStyle="rounded"
      flexGrow={1}
      maxHeight={12}
    >
      <box flexDirection="column" padding={1}>
        {tasks.map((task, index) => {
          const result = resultById.get(task.id);
          return (
            <box flexDirection="row" gap={1} key={task.id}>
              <text fg={color("accent")}>{String(index + 1).padStart(2, "0")}</text>
              <text fg={color("text")} truncate>
                {task.title}
              </text>
              <text fg={taskTone(result, task.privileged)}>
                {result?.status ?? (task.privileged ? "privileged" : "ready")}
              </text>
            </box>
          );
        })}
      </box>
    </scrollbox>
  );
}

function ResultPanel({ results }: { results: TaskResult[] }) {
  return (
    <Panel
      content={results
        .map((result) => `${result.id}: ${result.status} (${result.code})`)
        .join("\n")}
      title="TASK RESULTS"
    />
  );
}

function appendLog(setExecutionLines: ScreenProps["setExecutionLines"], lines: string[]) {
  setExecutionLines((previous) => [...previous, ...lines]);
}
