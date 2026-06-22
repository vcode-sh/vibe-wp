import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/patterns/page-header";
import { ProvisionWizard } from "@/components/provisioning/provision-wizard";
import type { ProvisionMode } from "@/components/provisioning/wizard-types";
import { TopBar } from "@/components/top-bar";

interface NewSiteSearch {
	mode: ProvisionMode;
}

export const Route = createFileRoute("/_auth/sites/new")({
	component: NewSitePage,
	validateSearch: (search: Record<string, unknown>): NewSiteSearch => ({
		mode: search.mode === "external" ? "external" : "standard",
	}),
});

function NewSitePage() {
	const { mode } = Route.useSearch();
	const external = mode === "external";

	return (
		<>
			<TopBar crumbs={["Sites", external ? "New external site" : "New site"]} />
			<div className="mx-auto grid w-full max-w-3xl gap-4 p-6">
				<PageHeader
					subtitle={
						external
							? "Provision a site backed by your own MariaDB and Redis."
							: "Provision a new Vibe WP site on this server."
					}
					title={external ? "New site (external services)" : "New site"}
				/>
				<ProvisionWizard mode={mode} />
			</div>
		</>
	);
}
