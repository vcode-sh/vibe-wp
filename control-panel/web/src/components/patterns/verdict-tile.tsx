import { Card } from "@control-panel/ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@control-panel/ui/components/tooltip";
import { HelpCircle } from "lucide-react";

import { verdictTone } from "@/data/derive";
import type { MetricTile } from "@/data/types";

export function VerdictTile({ tile }: { tile: MetricTile }) {
	const tone = verdictTone(tile.verdict);
	return (
		<Card className="p-3">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs uppercase tracking-wide">
					{tile.label}
				</span>
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								aria-label={tile.help}
								className="inline-flex items-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
								type="button"
							/>
						}
					>
						<HelpCircle className="size-3.5" />
					</TooltipTrigger>
					<TooltipContent>{tile.help}</TooltipContent>
				</Tooltip>
			</div>
			<div className={`mt-2 font-bold text-base ${tone.text}`}>
				{tile.value}
			</div>
			<div className="mt-0.5 text-muted-foreground text-xs">{tile.detail}</div>
		</Card>
	);
}
