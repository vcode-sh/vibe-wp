import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

function LogsPage() {
	const { siteId } = Route.useParams();
	return (
		<main className="p-6">
			<h1 className="font-semibold text-2xl">{siteId} — Logs</h1>
			<p className="mt-2 text-muted-foreground text-sm">Coming soon.</p>
		</main>
	);
}
