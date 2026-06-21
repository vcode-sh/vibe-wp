import { useQuery } from "@tanstack/react-query";
import { Activity, Database, ServerCog, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { orpc } from "@/lib/orpc/client";

export function OverviewPage() {
	const healthCheck = useQuery(orpc.healthCheck.queryOptions());
	const isConnected = healthCheck.data?.status === "ok";

	return (
		<main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
			<section className="grid gap-4 border border-border bg-card p-6">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="font-semibold text-2xl tracking-tight">
							Vibe WP Control Panel
						</h1>
						<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
							A web operations surface for Vibe WP sites. The panel stays thin:
							it reads from the headless core and executes reviewed `bin/vibe`
							workflows instead of becoming a second runtime authority.
						</p>
					</div>
					<div className="flex items-center gap-2 border border-border px-3 py-2 text-sm">
						<div
							className={
								isConnected ? "size-2 bg-green-500" : "size-2 bg-red-500"
							}
						/>
						<span>{statusLabel(healthCheck.isLoading, isConnected)}</span>
					</div>
				</div>
			</section>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatusCard
					description="Hono + oRPC bridge for typed control-plane calls."
					icon={<ServerCog className="size-4" />}
					label="API"
					value={healthCheck.data?.service ?? "pending"}
				/>
				<StatusCard
					description="SQLite stores sessions, audit logs, and operation metadata only."
					icon={<Database className="size-4" />}
					label="Database"
					value="local metadata"
				/>
				<StatusCard
					description="Future operations must remain reviewable before changing a host."
					icon={<ShieldCheck className="size-4" />}
					label="Safety"
					value="review first"
				/>
				<StatusCard
					description="Live task logs should stream through the server with secrets redacted."
					icon={<Activity className="size-4" />}
					label="Execution"
					value="planned"
				/>
			</div>
		</main>
	);
}

function statusLabel(isLoading: boolean, isConnected: boolean) {
	if (isLoading) {
		return "Checking API";
	}

	return isConnected ? "API online" : "API offline";
}

function StatusCard({
	description,
	icon,
	label,
	value,
}: {
	description: string;
	icon: ReactNode;
	label: string;
	value: string;
}) {
	return (
		<section className="grid gap-3 border border-border bg-card p-4">
			<div className="flex items-center justify-between text-muted-foreground text-xs uppercase">
				<span>{label}</span>
				{icon}
			</div>
			<div className="font-medium text-sm">{value}</div>
			<p className="text-muted-foreground text-xs leading-5">{description}</p>
		</section>
	);
}
