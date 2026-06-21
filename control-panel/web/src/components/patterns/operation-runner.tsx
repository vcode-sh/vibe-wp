import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@control-panel/ui/components/dialog";
import { Progress } from "@control-panel/ui/components/progress";
import { ScrollArea } from "@control-panel/ui/components/scroll-area";
import { useEffect, useState } from "react";

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
				</DialogHeader>
				<Progress value={percent} />
				<ScrollArea className="h-48 rounded-md border border-border bg-background p-3 font-mono text-xs">
					{lines.slice(0, shown).map((line) => (
						<div className="text-muted-foreground" key={line}>
							{line}
						</div>
					))}
					{shown >= lines.length ? (
						<div className="text-success">✓ Done</div>
					) : null}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
