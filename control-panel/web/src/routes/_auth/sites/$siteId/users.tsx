import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { WpUsersCard } from "@/components/wp-users/wp-users-card";

export const Route = createFileRoute("/_auth/sites/$siteId/users")({
	component: SiteUsersPage,
});

function SiteUsersPage() {
	const { siteId } = Route.useParams();
	return (
		<>
			<TopBar crumbs={[siteId, "Users"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="Manage this site's WordPress users and reset their passwords. Admin only."
					title="WordPress users"
				/>
				<WpUsersCard siteId={siteId} />
			</div>
		</>
	);
}
