import { Button } from "@control-panel/ui/components/button";
import { Card } from "@control-panel/ui/components/card";
import { Check, ChevronUp } from "lucide-react";

import type { NeedItem } from "@/data/types";

export function NeedsYou({
	items,
	onAct,
}: {
	items: NeedItem[];
	onAct: (item: NeedItem) => void;
}) {
	if (items.length === 0) {
		return (
			<Card className="flex items-center gap-3 border-success/40 p-4 text-sm">
				<Check className="size-4 text-success" />
				<span className="text-muted-foreground">
					Nothing needs you right now.
				</span>
			</Card>
		);
	}
	return (
		<Card className="border-warning/50 border-l-4 p-4">
			<div className="mb-3 flex items-center gap-2 font-semibold text-sm">
				<ChevronUp className="size-4 text-warning" /> Needs you
				<span className="rounded-full border border-warning/50 bg-warning/10 px-2 text-warning text-xs">
					{items.length}
				</span>
				<span className="ml-auto text-muted-foreground text-xs">
					we always back up before changes
				</span>
			</div>
			<div className="grid gap-2">
				{items.map((item) => (
					<div
						className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
						key={item.id}
					>
						<div className="min-w-0">
							<div className="font-medium text-sm">{item.title}</div>
							<div className="mt-0.5 text-muted-foreground text-xs">
								{item.detail}
							</div>
						</div>
						<div className="ml-auto flex shrink-0 gap-2">
							<Button size="sm" variant="ghost">
								Later
							</Button>
							<Button onClick={() => onAct(item)} size="sm">
								{item.actionLabel}
							</Button>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
