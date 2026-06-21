import { Card, CardHeader, CardTitle } from "@control-panel/ui/components/card";

import { relativeTime } from "@/data/derive";
import type { ActivityEntry } from "@/data/types";

export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
	const now = new Date();
	return (
		<Card className="p-4">
			<CardHeader className="p-0">
				<CardTitle className="text-sm">Recent activity</CardTitle>
			</CardHeader>
			<ul className="mt-3 grid gap-2">
				{entries.map((e) => (
					<li className="flex items-baseline gap-3 text-sm" key={e.id}>
						<span className="w-20 shrink-0 text-muted-foreground text-xs">
							{relativeTime(e.whenISO, now)}
						</span>
						<span
							className={`relative top-1 size-2 shrink-0 rounded-full ${
								e.good ? "bg-success" : "bg-muted-foreground"
							}`}
						/>
						<span>{e.text}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}
