/**
 * MonitoringCard — a per-site status tile. Shows, at a glance, whether a site is
 * healthy (green / amber / red): uptime % over the window, TLS certificate
 * days-left (warn < 14d, alert < 3d / expired), an approximate DNS-resolution
 * flag, the latest HTTP status, and a small sparkline of recent reachability.
 * Each metric carries a plain-language help tooltip so a non-technical operator
 * understands what it means and why it matters. Read-only: the parent route owns
 * the refresh mutation. Colors are semantic tokens only — no hardcoded hex.
 */

import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/data/derive";
import type { client } from "@/lib/orpc/client";
import { UptimeSparkline } from "./sparkline";
import { StatTile } from "./stat-tile";
import {
	certLabel,
	certTier,
	dnsLabel,
	dnsTier,
	tierTextClass,
	uptimeTier,
} from "./tiers";

type SummaryEntry = Awaited<
	ReturnType<typeof client.monitoringSummary>
>[number];

function StatusBadge({ status }: { status: SummaryEntry["status"] }) {
	if (status === "ok") {
		return (
			<Badge className="bg-success text-success-foreground">Healthy</Badge>
		);
	}
	if (status === "warn") {
		return (
			<Badge className="bg-warning text-warning-foreground">Needs a look</Badge>
		);
	}
	if (status === "fail") {
		return <Badge variant="destructive">Action needed</Badge>;
	}
	return <Badge variant="outline">No data yet</Badge>;
}

const UPTIME_HELP =
	"Share of recent checks where the site answered. 100% means every check loaded the page. Below 100% means one or more checks failed in this window.";
const CERT_HELP =
	"Days until the HTTPS certificate expires. We warn under 14 days and flag red under 3 days or once expired — an expired certificate shows visitors a security warning.";
const DNS_HELP =
	"Whether the domain currently points at this server. This is approximate: it is inferred from the site being reachable, not a dedicated DNS lookup.";

export function MonitoringCard({
	entry,
	ups,
	now,
	windowLabel = "7d",
}: {
	entry: SummaryEntry;
	ups: number[];
	now: Date;
	windowLabel?: string;
}) {
	const httpLabel = entry.httpStatus === null ? "—" : String(entry.httpStatus);
	const uptimeLabel =
		entry.uptimePercent === null ? "—" : `${entry.uptimePercent}%`;
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
					<StatTile
						help={UPTIME_HELP}
						label={`Uptime (${windowLabel})`}
						sub={`${entry.sampleCount} check${entry.sampleCount === 1 ? "" : "s"}`}
						value={uptimeLabel}
						valueClass={tierTextClass(uptimeTier(entry.uptimePercent))}
					/>
					<StatTile
						help={CERT_HELP}
						label="TLS certificate"
						value={certLabel(entry.certDaysLeft)}
						valueClass={tierTextClass(certTier(entry.certDaysLeft))}
					/>
					<StatTile
						help={DNS_HELP}
						label="DNS"
						sub={entry.dnsApproximate ? "approximate" : undefined}
						value={dnsLabel(entry.dnsOk)}
						valueClass={tierTextClass(dnsTier(entry.dnsOk))}
					/>
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
							HTTP status {httpLabel}
						</span>
						<span className="text-muted-foreground text-xs">
							Last checked{" "}
							{entry.lastSampleISO
								? relativeTime(entry.lastSampleISO, now)
								: "never"}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
