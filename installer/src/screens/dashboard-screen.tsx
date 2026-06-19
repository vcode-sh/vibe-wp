import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { ScreenProps } from "../app/screen-props";
import { color, type ThemeColor } from "../app/theme";
import { space } from "../app/tokens";
import { useGlyphs } from "../components/glyph-context";
import { Panel } from "../components/primitives";
import { Section } from "../components/section";
import { Spinner } from "../components/spinner";
import {
  availableOperations,
  buildOperationTask,
  type ManageOperation,
  type OpSafety
} from "../core/manage-operations";
import { runTask, type TaskStatus } from "../core/task-runner";

const SAFETY_COLOR: Record<OpSafety, ThemeColor> = {
  safe: "success",
  caution: "warning",
  danger: "danger"
};

export function DashboardScreen({ state, plan }: ScreenProps) {
  const ops = availableOperations(state.stagingEnabled);
  const [selected, setSelected] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus | "idle">("idle");
  const [output, setOutput] = useState<string[]>([]);
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
        <text fg={color("subtle")}>{state.stagingEnabled ? "· staging on" : "· no staging"}</text>
      </box>
      <Section title="What would you like to do?">
        <box flexDirection="column">
          {ops.map((op, index) => (
            <OpRow active={index === selected} key={op.id} op={op} />
          ))}
        </box>
      </Section>
      <OpDetail confirmPending={confirmId === current?.id} op={current} status={status} />
      {output.length > 0 && <Panel content={output.join("\n")} maxLines={8} title="RESULT" />}
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
        <text attributes={TextAttributes.BOLD} fg={color("danger")}>
          {glyphs.warn} This changes your live site — press Enter again to confirm.
        </text>
      ) : (
        <box alignItems="center" flexDirection="row" gap={space.sm}>
          {status === "running" && <Spinner />}
          <text fg={color(status === "failed" ? "danger" : "subtle")}>
            {statusLine(status, op.safety)}
          </text>
        </box>
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
