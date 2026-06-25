/**
 * WindowSelect — a small segmented control to choose the history window the
 * monitoring view aggregates over (1 / 7 / 30 days). Pure presentational; the
 * route owns the selected value and re-queries. Semantic tokens only.
 */

import { Button } from "@/components/ui/button";

export interface WindowChoice {
	days: number;
	label: string;
}

export const WINDOW_CHOICES: WindowChoice[] = [
	{ days: 1, label: "24h" },
	{ days: 7, label: "7d" },
	{ days: 30, label: "30d" },
];

export function WindowSelect({
	value,
	onChange,
}: {
	value: number;
	onChange: (days: number) => void;
}) {
	return (
		<fieldset className="inline-flex items-center gap-1 rounded-md border border-border p-0.5">
			<legend className="sr-only">History window</legend>
			{WINDOW_CHOICES.map((c) => (
				<Button
					aria-pressed={value === c.days}
					className="h-7 px-2.5 text-xs"
					key={c.days}
					onClick={() => onChange(c.days)}
					size="sm"
					variant={value === c.days ? "secondary" : "ghost"}
				>
					{c.label}
				</Button>
			))}
		</fieldset>
	);
}
