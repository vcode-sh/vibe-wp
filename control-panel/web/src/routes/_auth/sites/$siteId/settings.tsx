import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/patterns/page-header";
import { RemoveSiteCard } from "@/components/provisioning/remove-site-dialog";
import { R2SiteBackupCard } from "@/components/settings/r2-site-card";
import { TopBar } from "@/components/top-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sitesQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/settings")({
	component: SiteSettingsPage,
});

function SiteSettingsPage() {
	const { siteId } = Route.useParams();
	const sites = useQuery(sitesQuery());
	const confirmText =
		sites.data?.find((s) => s.id === siteId)?.domain ?? siteId;

	return (
		<>
			<TopBar crumbs={[siteId, "Settings"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader subtitle="Per-site configuration." title="Site settings" />
				<Tabs defaultValue="backups">
					<TabsList>
						<TabsTrigger value="backups">Off-site backups</TabsTrigger>
						<TabsTrigger value="danger">Danger zone</TabsTrigger>
					</TabsList>
					<TabsContent className="pt-4" value="backups">
						<R2SiteBackupCard siteId={siteId} />
					</TabsContent>
					<TabsContent className="pt-4" value="danger">
						<RemoveSiteCard confirmText={confirmText} siteId={siteId} />
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
