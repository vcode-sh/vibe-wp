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
// after (re)subscribing, the connection likely dropped (the LineStream heartbeat
// stops refreshing `lastEventAt`) without a terminal `done`. The stream has no
// reconnect, so rather than infer an outcome from silence we ask the server for
// the authoritative job status. Jobs can legitimately run far longer than this.
const STALE_STREAM_MS = 15_000;

function isTerminal(status: JobStatus): boolean {
	return status === "succeeded" || status === "failed" || status === "canceled";
}

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
	// Transient display state when a stale stream couldn't be resolved against the
	// server (e.g. the job was evicted past its TTL). NON-sticky: never persisted,
	// so a later reconnect/refetch can still deliver the real terminal event.
	const [unknown, setUnknown] = useState(false);

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

	// A stream that has gone silent past the threshold without a terminal `done`
	// likely lost its connection (no reconnect, errors swallowed). NEVER infer the
	// outcome from silence — a long-running one-shot job (e.g. a ~9-min provision)
	// emits no lines and would be falsely failed. Ask the server for the real
	// status: persist it only if terminal; if the job is gone (NOT_FOUND) show a
	// non-sticky "Unknown" so a later refetch can still resolve it.
	useEffect(() => {
		if (persisted !== null || live.done) {
			return;
		}
		const isStale = now - live.lastEventAt >= STALE_STREAM_MS;
		if (!(isStale && live.lines.length === 0)) {
			return;
		}
		let on = true;
		client
			.operationsGet({ jobId: op.jobId })
			.then((job) => {
				if (!on) {
					return;
				}
				if (isTerminal(job.status)) {
					// Authoritative terminal status — persist it. A successful long op
					// that merely lost its stream resolves to "succeeded", never "failed".
					finish(op.jobId, job.status);
				}
				// Still queued/running: leave `active` true and keep waiting.
			})
			.catch(() => {
				// NOT_FOUND (evicted past TTL) or a transient fetch error: don't persist
				// a terminal status. Show "Unknown" until a refetch/reconnect resolves it.
				if (on) {
					setUnknown(true);
				}
			});
		return () => {
			on = false;
		};
	}, [
		persisted,
		live.done,
		live.lastEventAt,
		live.lines.length,
		now,
		op.jobId,
		finish,
	]);

	const done = persisted !== null || live.done || unknown;
	let status: JobStatus | "unknown" = "unknown";
	if (persisted !== null) {
		status = persisted;
	} else if (live.done) {
		status = live.status;
	}

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
