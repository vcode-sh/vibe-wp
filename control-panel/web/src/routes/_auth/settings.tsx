import { createFileRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
import { PageHeader } from "@/components/patterns/page-header";
import { MailCard } from "@/components/settings/mail-card";
import { NotifyCard } from "@/components/settings/notify-card";
import { R2GlobalCard } from "@/components/settings/r2-global-card";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	// Notifications / Mail / Backups read admin-only procedures. Showing those
	// tabs to a viewer/operator would fail every query with an unfixable "Try
	// again" loop — so gate them on role. General (theme) stays available to all.
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	return (
		<>
			<TopBar crumbs={["Settings"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle={
						isAdmin
							? "Panel preferences, notifications and off-site backup credentials."
							: "Panel preferences."
					}
					title="Settings"
				/>
				<Tabs defaultValue="general">
					<TabsList>
						<TabsTrigger value="general">General</TabsTrigger>
						{isAdmin ? (
							<>
								<TabsTrigger value="notifications">Notifications</TabsTrigger>
								<TabsTrigger value="mail">Mail</TabsTrigger>
								<TabsTrigger value="backups">Backups</TabsTrigger>
							</>
						) : null}
					</TabsList>

					<TabsContent className="grid gap-4 pt-4" value="general">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Appearance</CardTitle>
							</CardHeader>
							<CardContent className="flex items-center justify-between">
								<span className="text-sm">Theme</span>
								<ModeToggle />
							</CardContent>
						</Card>
					</TabsContent>

					{isAdmin ? (
						<>
							<TabsContent className="grid gap-4 pt-4" value="notifications">
								<NotifyCard />
							</TabsContent>

							<TabsContent className="grid gap-4 pt-4" value="mail">
								<MailCard />
							</TabsContent>

							<TabsContent className="pt-4" value="backups">
								<R2GlobalCard />
							</TabsContent>
						</>
					) : null}
				</Tabs>
			</div>
		</>
	);
}
