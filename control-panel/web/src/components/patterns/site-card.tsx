import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime, verdictTone } from "@/data/derive";
import { siteStatusQuery } from "@/data/queries";
import type { SiteSummary } from "@/data/types";

interface SiteCardProps {
	now: Date;
	site: SiteSummary;
}

export function SiteCard({ site, now }: SiteCardProps) {
	const statusResult = useQuery(siteStatusQuery(site.id));
	const dot = statusResult.data
		? verdictTone(statusResult.data.status).dot
		: "bg-muted animate-pulse";

	return (
		<Link
			className="group rounded-none focus-visible:outline-none"
			params={{ siteId: site.id }}
			to="/sites/$siteId/overview"
		>
			<Card className="transition-colors hover:border-primary group-focus-visible:border-primary">
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						{site.name}
						<span className={`size-2 rounded-full ${dot}`} />
					</CardTitle>
					<p className="text-muted-foreground text-xs">{site.domain}</p>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Badge variant="outline">
						{site.hasStaging ? "prod + staging" : "prod"}
					</Badge>
					<Badge variant="outline">
						backed up {relativeTime(site.lastBackupISO, now)}
					</Badge>
				</CardContent>
			</Card>
		</Link>
	);
}
