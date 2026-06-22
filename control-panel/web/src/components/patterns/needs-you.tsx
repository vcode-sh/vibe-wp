import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { NeedItem } from "@/data/types";

export function NeedsYou({
	items,
	onAct,
	onLater,
}: {
	items: NeedItem[];
	onAct: (item: NeedItem) => void;
	onLater: (id: string) => void;
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
		<Card className="border-warning/50 border-l-4 p-0">
			<Collapsible defaultOpen>
				<CollapsibleTrigger className="group/needs-you-trigger flex w-full items-center gap-2 rounded-sm p-4 text-left font-semibold text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50">
					<ChevronRight className="size-4 text-warning transition-transform group-data-[panel-open]/needs-you-trigger:rotate-90" />
					<span>Needs you</span>
					<span className="rounded-full border border-warning/50 bg-warning/10 px-2 text-warning text-xs">
						{items.length}
					</span>
					<span className="ml-auto text-muted-foreground text-xs">
						we always back up before changes
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent className="px-4 pb-4">
					<div className="grid gap-2">
						{items.map((item) => (
							<div
								className="flex items-center gap-3 rounded-sm border border-border bg-background p-3"
								key={item.id}
							>
								<div className="min-w-0">
									<div className="font-medium text-sm">{item.title}</div>
									<div className="mt-0.5 text-muted-foreground text-xs">
										{item.detail}
									</div>
								</div>
								<div className="ml-auto flex shrink-0 gap-2">
									<Button
										onClick={() => onLater(item.id)}
										size="sm"
										variant="ghost"
									>
										Later
									</Button>
									<Button onClick={() => onAct(item)} size="sm">
										{item.actionLabel}
									</Button>
								</div>
							</div>
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
