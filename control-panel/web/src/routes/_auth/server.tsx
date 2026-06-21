import { Button } from "@control-panel/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@control-panel/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { serverInfoQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function ServerPage() {
	const server = useQuery(serverInfoQuery());
	const [stopping, setStopping] = useState(false);

	return (
		<>
			<TopBar crumbs={["Server & security"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button onClick={() => toast.success("Hardening server (mock)…")}>
							Secure the server
						</Button>
					}
					subtitle="The VPS shared by all your sites."
					title="Server & security"
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">Host</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-1 text-sm">
							<div>{server.data?.vps ?? "—"}</div>
							<div>Sites: {server.data?.siteCount ?? "—"}</div>
							<div>Disk used: {server.data?.diskPercent ?? "—"}%</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">Security</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-1 text-sm">
							<div className="text-success">Firewall: on</div>
							<div className="text-success">fail2ban: active</div>
							<div className="text-success">Auto-updates: on</div>
						</CardContent>
					</Card>
				</div>
				<Card className="border-destructive/40">
					<CardContent className="flex items-center justify-between py-4">
						<div className="text-sm">
							<div className="font-medium">Stop a site</div>
							<div className="text-muted-foreground text-xs">
								Takes a site offline until you start it again.
							</div>
						</div>
						<Button onClick={() => setStopping(true)} variant="outline">
							Stop a site…
						</Button>
					</CardContent>
				</Card>
			</main>

			<SafetyConfirm
				confirmLabel="Stop the site"
				consequence="The site goes offline until you start it again. Your data and backups are untouched."
				onConfirm={() => {
					toast.success("Stopping the site (mock)…");
					setStopping(false);
				}}
				onOpenChange={setStopping}
				open={stopping}
				reversible
				title="Stop a site"
			/>
		</>
	);
}
