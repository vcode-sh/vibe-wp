import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function ServerPage() {
	return (
		<main className="p-6">
			<h1 className="font-semibold text-2xl">Server &amp; security</h1>
			<p className="mt-2 text-muted-foreground text-sm">Coming soon.</p>
		</main>
	);
}
