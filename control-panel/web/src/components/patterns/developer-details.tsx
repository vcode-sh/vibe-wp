import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function DeveloperDetails({ children }: { children: ReactNode }) {
	return (
		<Collapsible className="rounded-lg border border-border border-dashed">
			<CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-muted-foreground text-sm">
				<ChevronRight className="size-4 transition-transform data-[panel-open]:rotate-90" />
				Details for developers — containers, raw metrics, live logs, env
			</CollapsibleTrigger>
			<CollapsibleContent className="border-border border-t p-3 text-muted-foreground text-sm">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
