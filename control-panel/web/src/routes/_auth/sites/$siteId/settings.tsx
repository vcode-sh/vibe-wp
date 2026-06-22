import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/patterns/page-header";
import { RemoveSiteCard } from "@/components/provisioning/remove-site-dialog";
import { BackupScheduleCard } from "@/components/settings/backup-schedule-card";
import { R2SiteBackupCard } from "@/components/settings/r2-site-card";
import { SiteSettingsCard } from "@/components/settings/site-settings-card";
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
				<Tabs defaultValue="site">
					<TabsList>
						<TabsTrigger value="site">Site</TabsTrigger>
						<TabsTrigger value="backups">Backups</TabsTrigger>
						<TabsTrigger value="danger">Danger zone</TabsTrigger>
					</TabsList>
					<TabsContent className="pt-4" value="site">
						<SiteSettingsCard siteId={siteId} />
					</TabsContent>
					<TabsContent className="grid gap-4 pt-4" value="backups">
						<BackupScheduleCard siteId={siteId} />
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
