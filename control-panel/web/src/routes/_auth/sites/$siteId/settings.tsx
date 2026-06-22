import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/patterns/page-header";
import { R2SiteBackupCard } from "@/components/settings/r2-site-card";
import { TopBar } from "@/components/top-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_auth/sites/$siteId/settings")({
	component: SiteSettingsPage,
});

function SiteSettingsPage() {
	const { siteId } = Route.useParams();

	return (
		<>
			<TopBar crumbs={[siteId, "Settings"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader subtitle="Per-site configuration." title="Site settings" />
				<Tabs defaultValue="backups">
					<TabsList>
						<TabsTrigger value="backups">Off-site backups</TabsTrigger>
					</TabsList>
					<TabsContent className="pt-4" value="backups">
						<R2SiteBackupCard siteId={siteId} />
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
