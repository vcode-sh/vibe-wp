import { Progress } from "@control-panel/ui/components/progress";
import { Ban, CheckCircle2, XCircle } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { client } from "@/lib/orpc/client";

export function OperationRunner({
	open,
	onOpenChange,
	title,
	jobId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	jobId: string | null;
}) {
	const [lines, setLines] = useState<string[]>([]);
	const [done, setDone] = useState(false);
	const [result, setResult] = useState<
		"succeeded" | "failed" | "canceled" | null
	>(null);
	const [canceling, setCanceling] = useState(false);

	useEffect(() => {
		if (!(open && jobId)) {
			return;
		}
		setLines([]);
		setDone(false);
		setResult(null);
		setCanceling(false);
		let active = true;
		async function consume() {
			const iterator = await client.operationsStream({
				jobId: jobId as string,
			});
			for await (const ev of iterator) {
				if (!active) {
					break;
				}
				setLines((prev) => [...prev, ev.line].filter(Boolean));
				if (ev.done) {
					setDone(true);
					setResult(
						ev.status === "succeeded" ||
							ev.status === "failed" ||
							ev.status === "canceled"
							? ev.status
							: "succeeded"
					);
				}
			}
		}
		consume().catch(() => undefined);
		return () => {
			active = false;
		};
	}, [open, jobId]);

	useEffect(() => {
		if (!open) {
			setLines([]);
			setDone(false);
			setResult(null);
			setCanceling(false);
		}
	}, [open]);

	async function handleCancel() {
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

	function getPercent() {
		if (done) {
			return 100;
		}
		if (lines.length === 0) {
			return 0;
		}
		return 50;
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<div className="flex items-center justify-between gap-2">
						<div>
							<DialogTitle>{title}</DialogTitle>
							<DialogDescription>
								Running operation — {lines.length} steps.
							</DialogDescription>
						</div>
						{!done && jobId ? (
							<Button
								disabled={canceling}
								onClick={handleCancel}
								size="sm"
								variant="ghost"
							>
								{canceling ? "Canceling…" : "Cancel"}
							</Button>
						) : null}
					</div>
				</DialogHeader>
				<Progress value={getPercent()} />
				<ScrollArea
					aria-live="polite"
					className="h-48 rounded-md border border-border bg-background p-3 font-mono text-xs"
				>
					{lines.map((line) => (
						<div className="text-muted-foreground" key={line}>
							{line}
						</div>
					))}
					{done && result === "succeeded" ? (
						<div className="flex items-center gap-1 text-success">
							<CheckCircle2 aria-hidden="true" className="size-3.5" />
							<span>Done</span>
						</div>
					) : null}
					{done && result === "failed" ? (
						<div className="flex items-center gap-1 text-destructive">
							<XCircle aria-hidden="true" className="size-3.5" />
							<span>Failed</span>
						</div>
					) : null}
					{done && result === "canceled" ? (
						<div className="flex items-center gap-1 text-muted-foreground">
							<Ban aria-hidden="true" className="size-3.5" />
							<span>Canceled</span>
						</div>
					) : null}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
