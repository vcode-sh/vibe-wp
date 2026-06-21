import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";

import { verdictTone } from "@/data/derive";
import type { Verdict } from "@/data/types";

export function StatusHero({
	headline,
	status,
	subline,
	calm,
}: {
	headline: string;
	status: Verdict;
	subline: string;
	calm: boolean;
}) {
	const tone = verdictTone(status);
	return (
		<Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
			<div
				className={`flex size-11 items-center justify-center rounded-full ring-2 ${tone.ring} ${tone.text}`}
			>
				<Check className="size-5" />
			</div>
			<div className="min-w-0">
				<h1 className="font-semibold text-xl tracking-tight">{headline}</h1>
				<p className="mt-1 flex items-center gap-2 text-muted-foreground text-sm">
					<span className={`inline-flex items-center gap-1 ${tone.text}`}>
						<span
							className={`size-1.5 rounded-full motion-safe:animate-pulse ${tone.dot}`}
						/>{" "}
						live
					</span>
					· {subline}
				</p>
			</div>
			{calm ? (
				<div
					className={`ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${tone.text} ${tone.bg}`}
				>
					<Check aria-hidden="true" className="size-4" /> Nothing needs you
				</div>
			) : null}
		</Card>
	);
}
