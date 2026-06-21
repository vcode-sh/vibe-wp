import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<main className="p-6">
			<h1 className="font-semibold text-2xl">Settings</h1>
			<p className="mt-2 text-muted-foreground text-sm">Coming soon.</p>
		</main>
	);
}
