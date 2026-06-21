import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import { orpc } from "@/lib/orpc/client";

interface OperationsPageProps {
	userName?: string | null;
}

export function OperationsPage({ userName }: OperationsPageProps) {
	const overview = useQuery(orpc.controlOverview.queryOptions());

	return (
		<main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
			<section className="grid gap-2">
				<h1 className="font-semibold text-2xl tracking-tight">Operations</h1>
				<p className="text-muted-foreground text-sm">
					Signed in as {userName}. This is the first protected control surface
					for site inventory, reviewed tasks, and audit history.
				</p>
			</section>

			<section className="grid gap-4 border border-border bg-card p-5">
				<div>
					<h2 className="font-medium text-lg">Control-plane contract</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{overview.data?.sourceOfTruth ?? "Loading source contract..."}
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{overview.data?.capabilities.map((capability) => (
						<div
							className="flex gap-3 border border-border p-3"
							key={capability.name}
						>
							<CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />
							<div>
								<div className="font-medium text-sm">{capability.name}</div>
								<div className="mt-1 text-muted-foreground text-xs leading-5">
									{capability.detail}
								</div>
							</div>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
