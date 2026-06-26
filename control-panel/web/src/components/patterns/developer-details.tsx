import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function DeveloperDetails({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible
			className="rounded-lg border border-border border-dashed"
			onOpenChange={setOpen}
			open={open}
		>
			<CollapsibleTrigger className="group/dev-details flex w-full items-center gap-2 rounded-sm p-3 text-muted-foreground text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50">
				<ChevronRight className="size-4 transition-transform group-data-[panel-open]/dev-details:rotate-90" />
				Details for developers — containers, raw metrics, live logs, env
			</CollapsibleTrigger>
			<CollapsibleContent className="border-border border-t p-3 text-muted-foreground text-sm">
				{open ? children : null}
			</CollapsibleContent>
		</Collapsible>
	);
}
