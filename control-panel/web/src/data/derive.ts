import type { MetricTile, Verdict } from "./types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function relativeTime(iso: string, now: Date): string {
	if (!iso) {
		return "never";
	}
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t) || t <= 0) {
		return "never";
	}
	const diff = now.getTime() - t;
	if (diff < MINUTE) {
		return "just now";
	}
	if (diff < HOUR) {
		return `${Math.floor(diff / MINUTE)}m ago`;
	}
	if (diff < DAY) {
		return `${Math.floor(diff / HOUR)}h ago`;
	}
	const days = Math.floor(diff / DAY);
	if (days === 1) {
		return "Yesterday";
	}
	return `${days} days ago`;
}

const RANK: Record<Verdict, number> = { good: 0, watch: 1, act: 2 };

export function overallVerdict(tiles: MetricTile[]): Verdict {
	let worst: Verdict = "good";
	for (const t of tiles) {
		if (RANK[t.verdict] > RANK[worst]) {
			worst = t.verdict;
		}
	}
	return worst;
}

export function verdictTone(v: Verdict): {
	text: string;
	bg: string;
	ring: string;
	dot: string;
} {
	if (v === "good") {
		return {
			text: "text-success",
			bg: "bg-success/10",
			ring: "ring-success/30",
			dot: "bg-success",
		};
	}
	if (v === "watch") {
		return {
			text: "text-warning",
			bg: "bg-warning/10",
			ring: "ring-warning/30",
			dot: "bg-warning",
		};
	}
	return {
		text: "text-destructive",
		bg: "bg-destructive/10",
		ring: "ring-destructive/30",
		dot: "bg-destructive",
	};
}
