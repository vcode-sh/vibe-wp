import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { NeedItem } from "@/data/types";

export function NeedsYou({
	items,
	siteId,
	onAct,
	onLater,
}: {
	items: NeedItem[];
	siteId: string;
	onAct: (item: NeedItem) => void;
	onLater: (id: string) => void;
}) {
	const navigate = useNavigate();

	// Most needs resolve on a dedicated page that already has the real, reviewed
	// flow. Route there; only plugin updates run inline via the parent's mutation.
	function handleAct(item: NeedItem) {
		if (item.icon === "backup") {
			navigate({ to: "/sites/$siteId/backups", params: { siteId } });
			return;
		}
		if (item.icon === "cert" || item.icon === "disk") {
			navigate({ to: "/sites/$siteId/health", params: { siteId } });
			return;
		}
		if (item.icon === "security") {
			navigate({ to: "/server" });
			return;
		}
		onAct(item);
	}
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
									<Button onClick={() => handleAct(item)} size="sm">
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
