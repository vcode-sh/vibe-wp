import { Progress } from "@control-panel/ui/components/progress";
import { ScrollArea } from "@control-panel/ui/components/scroll-area";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function OperationRunner({
	open,
	onOpenChange,
	title,
	lines,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	lines: string[];
}) {
	const [shown, setShown] = useState(0);

	useEffect(() => {
		if (!open) {
			setShown(0);
			return;
		}
		if (shown >= lines.length) {
			return;
		}
		const id = setTimeout(() => setShown((n) => n + 1), 500);
		return () => clearTimeout(id);
	}, [open, shown, lines.length]);

	const percent = lines.length === 0 ? 100 : (shown / lines.length) * 100;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Running operation — {lines.length} steps.
					</DialogDescription>
				</DialogHeader>
				<Progress value={percent} />
				<ScrollArea
					aria-live="polite"
					className="h-48 rounded-md border border-border bg-background p-3 font-mono text-xs"
				>
					{lines.slice(0, shown).map((line) => (
						<div className="text-muted-foreground" key={line}>
							{line}
						</div>
					))}
					{shown >= lines.length ? (
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
