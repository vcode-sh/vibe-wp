/**
 * MonitoringCard — a per-site status tile for the monitoring view. Shows uptime
 * % over the summary window, cert days-left (warn styling < 14d, destructive
 * when expired), an approximate DNS-drift flag, the latest HTTP status, and a
 * small inline sparkline of recent `up` samples. Read-only: the parent route
 * owns the refresh mutation. Types are derived from the typed oRPC client so
 * they track the server without a contract import. Colors are semantic tokens
 * only (bg-warning/text-warning-foreground/text-destructive) — no hardcoded hex.
 */

import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/data/derive";
import type { client } from "@/lib/orpc/client";
import { UptimeSparkline } from "./sparkline";

type SummaryEntry = Awaited<
	ReturnType<typeof client.monitoringSummary>
>[number];

/** Cert warn threshold (days). Below this we surface a warning style. */
const CERT_WARN_DAYS = 14;

function StatusBadge({ status }: { status: SummaryEntry["status"] }) {
	if (status === "ok") {
		return (
			<Badge className="bg-success text-success-foreground">Healthy</Badge>
		);
	}
	if (status === "warn") {
		return (
			<Badge className="bg-warning text-warning-foreground">Warning</Badge>
		);
	}
	if (status === "fail") {
		return <Badge variant="destructive">Failing</Badge>;
	}
	return <Badge variant="outline">No data</Badge>;
}

function UptimeStat({ entry }: { entry: SummaryEntry }) {
	const pct = entry.uptimePercent;
	const label = pct === null ? "—" : `${pct}%`;
	let tone = "text-success";
	if (pct !== null && pct < 100) {
		tone = pct >= 95 ? "text-warning-foreground" : "text-destructive";
	}
	return (
		<div className="grid gap-0.5">
			<span className="text-muted-foreground text-xs">Uptime (7d)</span>
			<span className={`font-semibold text-lg ${tone}`}>{label}</span>
			<span className="text-muted-foreground text-xs">
				{entry.sampleCount} sample{entry.sampleCount === 1 ? "" : "s"}
			</span>
		</div>
	);
}

function CertStat({ days }: { days: number | null }) {
	let label = "—";
	let tone = "text-foreground";
	if (days !== null) {
		if (days < 0) {
			label = `expired ${Math.abs(days)}d ago`;
			tone = "text-destructive";
		} else {
			label = `${days}d left`;
			tone = days < CERT_WARN_DAYS ? "text-warning-foreground" : "text-success";
		}
	}
	return (
		<div className="grid gap-0.5">
			<span className="text-muted-foreground text-xs">TLS certificate</span>
			<span className={`font-semibold text-lg ${tone}`}>{label}</span>
		</div>
	);
}

function DnsStat({ entry }: { entry: SummaryEntry }) {
	let label = "—";
	let tone = "text-foreground";
	if (entry.dnsOk !== null) {
		label = entry.dnsOk === 1 ? "Resolving" : "DNS drift";
		tone = entry.dnsOk === 1 ? "text-success" : "text-destructive";
	}
	return (
		<div className="grid gap-0.5">
			<span className="text-muted-foreground text-xs">DNS</span>
			<span className={`font-semibold text-lg ${tone}`}>{label}</span>
			{entry.dnsApproximate ? (
				<span className="text-muted-foreground text-xs">approximate</span>
			) : null}
		</div>
	);
}

export function MonitoringCard({
	entry,
	ups,
	now,
}: {
	entry: SummaryEntry;
	ups: number[];
	now: Date;
}) {
	const httpLabel = entry.httpStatus === null ? "—" : String(entry.httpStatus);
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Activity className="size-4" />
					{entry.domain || entry.siteId}
				</CardTitle>
				<StatusBadge status={entry.status} />
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid grid-cols-3 gap-3">
					<UptimeStat entry={entry} />
					<CertStat days={entry.certDaysLeft} />
					<DnsStat entry={entry} />
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="grid gap-0.5">
						<span className="text-muted-foreground text-xs">
							Recent reachability
						</span>
						<UptimeSparkline ups={ups} />
					</div>
					<div className="grid gap-0.5 text-right">
						<span className="text-muted-foreground text-xs">
							HTTP {httpLabel}
						</span>
						<span className="text-muted-foreground text-xs">
							Last sample {relativeTime(entry.lastSampleISO ?? "", now)}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
