import { Progress } from "@control-panel/ui/components/progress";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
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

	useEffect(() => {
		if (!(open && jobId)) {
			return;
		}
		setLines([]);
		setDone(false);
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
		}
	}, [open]);

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
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Running operation — {lines.length} steps.
					</DialogDescription>
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
					{done ? (
						<div className="flex items-center gap-1 text-success">
							<CheckCircle2 aria-hidden="true" className="size-3.5" />
							<span>Done</span>
						</div>
					) : null}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
