/**
 * OverviewTile — a compact all-sites status card for the monitoring overview.
 * Surfaces the one thing that matters per site (a green/amber/red status dot +
 * plain label) plus the three headline metrics (uptime, cert, DNS) in small
 * type. Clicking the title deep-links to that site's full monitoring detail.
 * Read-only; semantic tokens only.
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/data/derive";
import type { client } from "@/lib/orpc/client";
import {
	certLabel,
	certTier,
	dnsLabel,
	dnsTier,
	statusTier,
	type Tier,
	tierTextClass,
	uptimeTier,
} from "./tiers";

type SummaryEntry = Awaited<
	ReturnType<typeof client.monitoringOverview>
>[number];

function dotClass(tier: Tier): string {
	if (tier === "ok") {
		return "bg-success";
	}
	if (tier === "warn") {
		return "bg-warning";
	}
	if (tier === "alert") {
		return "bg-destructive";
	}
	return "bg-muted-foreground";
}

function statusWord(status: SummaryEntry["status"]): string {
	if (status === "ok") {
		return "Healthy";
	}
	if (status === "warn") {
		return "Needs a look";
	}
	if (status === "fail") {
		return "Action needed";
	}
	return "No data yet";
}

function MiniMetric({
	label,
	value,
	tier,
}: {
	label: string;
	value: string;
	tier: Tier;
}) {
	return (
		<div className="grid gap-0.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className={`font-medium text-sm ${tierTextClass(tier)}`}>
				{value}
			</span>
		</div>
	);
}

export function OverviewTile({
	entry,
	now,
}: {
	entry: SummaryEntry;
	now: Date;
}) {
	const sTier = statusTier(entry.status);
	return (
		<Card>
			<CardContent className="grid gap-3 p-4">
				<Link
					className="flex items-center justify-between gap-2 hover:underline"
					params={{ siteId: entry.siteId }}
					to="/sites/$siteId/monitoring"
				>
					<span className="flex items-center gap-2 truncate font-medium text-sm">
						<span
							className={`size-2.5 shrink-0 rounded-full ${dotClass(sTier)}`}
						/>
						<span className="truncate">{entry.domain || entry.siteId}</span>
					</span>
					<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
				</Link>
				<span className={`text-sm ${tierTextClass(sTier)}`}>
					{statusWord(entry.status)}
				</span>
				<div className="grid grid-cols-3 gap-2">
					<MiniMetric
						label="Uptime"
						tier={uptimeTier(entry.uptimePercent)}
						value={
							entry.uptimePercent === null ? "—" : `${entry.uptimePercent}%`
						}
					/>
					<MiniMetric
						label="Certificate"
						tier={certTier(entry.certDaysLeft)}
						value={certLabel(entry.certDaysLeft)}
					/>
					<MiniMetric
						label="DNS"
						tier={dnsTier(entry.dnsOk)}
						value={dnsLabel(entry.dnsOk)}
					/>
				</div>
				<span className="text-muted-foreground text-xs">
					Last checked{" "}
					{entry.lastSampleISO
						? relativeTime(entry.lastSampleISO, now)
						: "never"}
				</span>
			</CardContent>
		</Card>
	);
}
