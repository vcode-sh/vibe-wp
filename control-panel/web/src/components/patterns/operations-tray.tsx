import { Ban, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLiveStream } from "@/lib/live/use-live-stream";
import {
	type Operation,
	useOperations,
} from "@/lib/operations/operations-provider";
import { client } from "@/lib/orpc/client";

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
	status: string;
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
	return (
		<span className="flex items-center gap-1 text-muted-foreground text-xs">
			<Ban aria-hidden className="size-3" />
			<span>Canceled</span>
		</span>
	);
}

function TrayCard({ op }: { op: Operation }) {
	const { expand, dismiss, finish } = useOperations();
	const live = useLiveStream(
		(signal) => client.operationsStream({ jobId: op.jobId }, { signal }),
		true
	);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (live.done) {
			finish(op.jobId);
			return;
		}
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [live.done, op.jobId, finish]);

	return (
		<div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 shadow-md">
			<button
				className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
				onClick={() => expand(op.jobId)}
				type="button"
			>
				<span className="truncate font-medium text-sm">{op.title}</span>
				<TrayCardStatus
					done={live.done}
					now={now}
					startedAt={op.startedAt}
					status={live.status}
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
