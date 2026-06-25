/**
 * StatTile — one labelled monitoring metric with a plain-language help tooltip.
 * The value color comes from a precomputed semantic-token class (see tiers.ts);
 * the help text explains, in non-technical language, WHAT the metric means and
 * WHY it matters, so a non-technical operator never needs the docs. The help
 * trigger is a real focusable button with an aria-label for keyboard/screen
 * readers.
 */

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@control-panel/ui/components/tooltip";
import { HelpCircle } from "lucide-react";

export function StatTile({
	label,
	value,
	valueClass,
	sub,
	help,
}: {
	label: string;
	value: string;
	valueClass: string;
	sub?: string;
	help: string;
}) {
	return (
		<div className="grid gap-0.5">
			<span className="flex items-center gap-1 text-muted-foreground text-xs">
				{label}
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								aria-label={`What does ${label} mean? ${help}`}
								className="inline-flex items-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
								type="button"
							/>
						}
					>
						<HelpCircle className="size-3" />
					</TooltipTrigger>
					<TooltipContent>{help}</TooltipContent>
				</Tooltip>
			</span>
			<span className={`font-semibold text-lg ${valueClass}`}>{value}</span>
			{sub ? (
				<span className="text-muted-foreground text-xs">{sub}</span>
			) : null}
		</div>
	);
}
