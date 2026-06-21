import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

function StagingPage() {
	const { siteId } = Route.useParams();
	return (
		<main className="p-6">
			<h1 className="font-semibold text-2xl">{siteId} — Staging</h1>
			<p className="mt-2 text-muted-foreground text-sm">Coming soon.</p>
		</main>
	);
}
