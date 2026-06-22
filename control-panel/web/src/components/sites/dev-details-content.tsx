import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Badge } from "@/components/ui/badge";
import { devInfoQuery } from "@/data/queries";

function statusVariant(
	status: string
): "default" | "secondary" | "destructive" | "outline" {
	const s = status.toLowerCase();
	if (s.includes("running") && s.includes("healthy")) {
		return "default";
	}
	if (s.includes("running")) {
		return "secondary";
	}
	if (s.includes("exited") || s.includes("dead")) {
		return "destructive";
	}
	return "outline";
}

interface Props {
	siteId: string;
}

export function DevDetailsContent({ siteId }: Props) {
	const devInfo = useQuery(devInfoQuery(siteId));

	return (
		<QueryBoundary
			errorMessage="Couldn't load developer info."
			hasData={Boolean(devInfo.data)}
			isError={devInfo.isError}
			isLoading={devInfo.isLoading}
			onRetry={() => devInfo.refetch()}
			skeletonClassName="h-24 w-full"
		>
			{devInfo.data ? (
				<div className="grid gap-4">
					{devInfo.data.containers.length > 0 ? (
						<section>
							<p className="mb-2 font-medium text-foreground text-xs uppercase tracking-wide">
								Containers
							</p>
							<ul className="grid gap-1.5">
								{devInfo.data.containers.map((c) => (
									<li
										className="flex items-center justify-between gap-2"
										key={c.name}
									>
										<span className="font-mono text-xs">{c.name}</span>
										<Badge variant={statusVariant(c.status)}>{c.status}</Badge>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{Object.keys(devInfo.data.env).length > 0 ? (
						<section>
							<p className="mb-2 font-medium text-foreground text-xs uppercase tracking-wide">
								Environment
							</p>
							<ul className="grid gap-1 font-mono text-xs">
								{Object.entries(devInfo.data.env).map(([k, v]) => (
									<li className="flex gap-2" key={k}>
										<span className="min-w-[13ch] shrink-0 text-muted-foreground">
											{k}
										</span>
										<span className="break-all text-foreground">{v}</span>
									</li>
								))}
							</ul>
						</section>
					) : null}

					<section>
						<p className="mb-2 font-medium text-foreground text-xs uppercase tracking-wide">
							Quick links
						</p>
						<ul className="grid gap-1 text-xs">
							<li>
								<Link
									className="inline-flex items-center gap-1 text-primary hover:underline"
									params={{ siteId }}
									to="/sites/$siteId/health"
								>
									Health &amp; perf report
									<ExternalLink className="size-3" />
								</Link>
							</li>
							<li>
								<Link
									className="inline-flex items-center gap-1 text-primary hover:underline"
									params={{ siteId }}
									to="/sites/$siteId/logs"
								>
									Live logs
									<ExternalLink className="size-3" />
								</Link>
							</li>
						</ul>
					</section>
				</div>
			) : null}
		</QueryBoundary>
	);
}
