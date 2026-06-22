import {
	Ban,
	CheckCircle2,
	HelpCircle,
	Loader2,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/data/types";
import { useLiveStream } from "@/lib/live/use-live-stream";
import {
	type Operation,
	useOperations,
} from "@/lib/operations/operations-provider";
import { client } from "@/lib/orpc/client";

// If a live stream for a not-yet-finished op produces no events for this long
// after (re)subscribing, the server-side job record was likely evicted and the
// stream closed without a terminal `done`. Treat that as unknown rather than a
// perpetual "running" spinner.
const STALE_STREAM_MS = 15_000;

function elapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TrayCardStatus({
	done,
	status,
	startedAt,
	now,
}: {
	done: boolean;
	status: JobStatus | "unknown";
	startedAt: number;
	now: number;
}) {
	if (!done) {
		return (
			<span className="flex items-center gap-1 text-muted-foreground text-xs">
				<Loader2 aria-hidden className="size-3 animate-spin" />
				<span>{elapsed(now - startedAt)}</span>
			</span>
		);
	}
	if (status === "succeeded") {
		return (
			<span className="flex items-center gap-1 text-success text-xs">
				<CheckCircle2 aria-hidden className="size-3" />
				<span>Done</span>
			</span>
		);
	}
	if (status === "failed") {
		return (
			<span className="flex items-center gap-1 text-destructive text-xs">
				<XCircle aria-hidden className="size-3" />
				<span>Failed</span>
			</span>
		);
	}
	if (status === "canceled") {
		return (
			<span className="flex items-center gap-1 text-muted-foreground text-xs">
				<Ban aria-hidden className="size-3" />
				<span>Canceled</span>
			</span>
		);
	}
	// "queued"/"running" reported as terminal, or a stream that closed without a
	// `done` event: we can't confirm the outcome, so say so rather than spin.
	return (
		<span className="flex items-center gap-1 text-muted-foreground text-xs">
			<HelpCircle aria-hidden className="size-3" />
			<span>Unknown</span>
		</span>
	);
}

function TrayCard({ op }: { op: Operation }) {
	const { expand, dismiss, finish, statusOf } = useOperations();
	// Persisted terminal status is authoritative for an already-finished op (e.g.
	// after a reload). When present we render from it and never (re)subscribe to a
	// stream whose server-side job may have been evicted.
	const persisted = statusOf(op.jobId);
	const live = useLiveStream(
		(signal) => client.operationsStream({ jobId: op.jobId }, { signal }),
		persisted === null
	);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (persisted !== null) {
			return;
		}
		if (live.done) {
			finish(op.jobId, live.status);
			return;
		}
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [persisted, live.done, live.status, op.jobId, finish]);

	// A stream that produced no events well past (re)subscription likely closed
	// without a terminal `done` (evicted/gone job). Mark it finished so it shows a
	// terminal state and doesn't re-stream forever on the next reload.
	useEffect(() => {
		if (persisted !== null || live.done) {
			return;
		}
		const sinceLastEvent = STALE_STREAM_MS - (now - live.lastEventAt);
		if (sinceLastEvent <= 0 && live.lines.length === 0) {
			finish(op.jobId, "failed");
			return;
		}
	}, [
		persisted,
		live.done,
		live.lastEventAt,
		live.lines.length,
		now,
		op.jobId,
		finish,
	]);

	const done = persisted !== null || live.done;
	const status: JobStatus | "unknown" =
		persisted ?? (live.done ? live.status : "unknown");

	return (
		<div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 shadow-md">
			<button
				className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
				onClick={() => expand(op.jobId)}
				type="button"
			>
				<span className="truncate font-medium text-sm">{op.title}</span>
				<TrayCardStatus
					done={done}
					now={now}
					startedAt={op.startedAt}
					status={status}
				/>
			</button>
			<Button
				aria-label={`Dismiss ${op.title}`}
				className="size-6 shrink-0"
				onClick={() => dismiss(op.jobId)}
				size="icon"
				variant="ghost"
			>
				<X aria-hidden className="size-3.5" />
			</Button>
		</div>
	);
}

export function OperationsTray() {
	const { ops, expandedId } = useOperations();
	const visible = ops.filter((o) => o.jobId !== expandedId);

	if (visible.length === 0) {
		return null;
	}

	return (
		<div className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
			{visible.map((op) => (
				<TrayCard key={op.jobId} op={op} />
			))}
		</div>
	);
}
