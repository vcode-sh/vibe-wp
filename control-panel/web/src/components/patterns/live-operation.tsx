import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { Progress } from "@control-panel/ui/components/progress";
import { Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { GENERIC_STEPS, OP_STEPS } from "@/lib/live/op-steps";
import { parseRcloneProgress } from "@/lib/live/progress";
import { deriveSteps, type Step } from "@/lib/live/steps";
import { useAutoScroll } from "@/lib/live/use-auto-scroll";
import { useLiveStream } from "@/lib/live/use-live-stream";
import { client } from "@/lib/orpc/client";

function elapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function StepIcon({ state }: { state: Step["state"] }) {
	if (state === "done") {
		return <CheckCircle2 aria-hidden className="size-4 text-success" />;
	}
	if (state === "active") {
		return <Loader2 aria-hidden className="size-4 animate-spin text-primary" />;
	}
	return (
		<span aria-hidden className="size-4 text-center text-muted-foreground">
			·
		</span>
	);
}

function TerminalStatus({ status }: { status: string }) {
	if (status === "failed") {
		return (
			<div className="flex items-center gap-1 text-destructive text-sm">
				<XCircle aria-hidden className="size-4" />
				<span>Failed</span>
			</div>
		);
	}
	if (status === "canceled") {
		return (
			<div className="flex items-center gap-1 text-muted-foreground text-sm">
				<Ban aria-hidden className="size-4" />
				<span>Canceled</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-1 text-sm text-success">
			<CheckCircle2 aria-hidden className="size-4" />
			<span>Done</span>
		</div>
	);
}

export function LiveOperation({
	open,
	onOpenChange,
	title,
	kind,
	jobId,
	startedAt,
}: {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	title: string;
	kind: string;
	jobId: string | null;
	startedAt?: number;
}) {
	const [now, setNow] = useState(() => Date.now());
	const [canceling, setCanceling] = useState(false);
	const live = useLiveStream(
		() => client.operationsStream({ jobId: jobId as string }),
		Boolean(open && jobId)
	);

	useEffect(() => {
		if (!open || live.done) {
			return;
		}
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [open, live.done]);

	useEffect(() => {
		if (open) {
			setCanceling(false);
		}
	}, [open]);

	// Auto-scroll the raw-log pane as lines arrive; only follows when pinned.
	const logRef = useAutoScroll<HTMLDivElement>(live.lines.length);

	const rawSteps = deriveSteps(live.lines, OP_STEPS[kind] ?? GENERIC_STEPS);
	// Once finished, the trailing "active" step is complete — stop its spinner.
	const steps = live.done
		? rawSteps.map((s) =>
				s.state === "active" ? { ...s, state: "done" as const } : s
			)
		: rawSteps;
	const progress = parseRcloneProgress(live.lastLine);
	// "Still working…" tracks the last real output line — heartbeats keep the
	// connection alive but must not suppress the no-recent-output reassurance.
	const idle = !live.done && now - live.lastLineAt > 5000;

	async function cancel() {
		if (!jobId || canceling) {
			return;
		}
		setCanceling(true);
		try {
			await client.operationsCancel({ jobId });
		} catch {
			toast.error("Couldn't cancel the operation.");
			setCanceling(false);
		}
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="pr-8">{title}</DialogTitle>
					<DialogDescription className="flex items-center gap-2">
						<span>{live.done ? "Operation finished." : "Running…"}</span>
						<span className="font-mono text-xs">
							· {elapsed(now - (startedAt ?? live.startedAt))}
						</span>
					</DialogDescription>
				</DialogHeader>

				<ol className="grid gap-1.5">
					{steps.map((step) => (
						<li
							className={`flex items-center gap-2 text-sm ${step.state === "pending" ? "text-muted-foreground" : ""}`}
							key={step.label}
						>
							<StepIcon state={step.state} />
							<span>{step.label}</span>
						</li>
					))}
				</ol>

				{progress && !live.done ? (
					<div className="grid gap-1">
						<Progress value={progress.percent} />
						<p className="text-muted-foreground text-xs">
							{progress.percent}% · {progress.transferred} / {progress.total}
							{progress.eta ? ` · ~${progress.eta} left` : ""}
						</p>
					</div>
				) : null}

				{idle && !progress ? (
					<p className="text-muted-foreground text-xs">Still working…</p>
				) : null}

				{live.done ? (
					<TerminalStatus status={live.status} />
				) : (
					<div className="flex justify-end">
						<Button
							disabled={canceling}
							onClick={cancel}
							size="sm"
							variant="outline"
						>
							{canceling ? "Canceling…" : "Cancel"}
						</Button>
					</div>
				)}

				<Collapsible>
					<CollapsibleTrigger className="text-muted-foreground text-xs underline">
						Show details
					</CollapsibleTrigger>
					<CollapsibleContent>
						{/* Plain div so the ref attaches directly to the scrollable element. */}
						<div
							className="mt-2 h-40 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs"
							ref={logRef}
						>
							<pre className="whitespace-pre-wrap break-words">
								{live.lines.join("\n")}
							</pre>
						</div>
					</CollapsibleContent>
				</Collapsible>
			</DialogContent>
		</Dialog>
	);
}
