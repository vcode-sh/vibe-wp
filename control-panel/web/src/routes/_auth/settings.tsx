import { Label } from "@control-panel/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
import { PageHeader } from "@/components/patterns/page-header";
import { R2GlobalCard } from "@/components/settings/r2-global-card";
import { R2SiteCard } from "@/components/settings/r2-site-card";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<>
			<TopBar crumbs={["Settings"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="Panel preferences and alert channels."
					title="Settings"
				/>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Appearance</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<span className="text-sm">Theme</span>
						<ModeToggle />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Alert channels</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div className="grid gap-1.5">
							<Label htmlFor="telegram">Telegram chat ID</Label>
							<Input id="telegram" placeholder="123456789" />
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="webhook">Webhook URL</Label>
							<Input id="webhook" placeholder="https://…" />
						</div>
						<Button className="justify-self-start">Save</Button>
					</CardContent>
				</Card>
				<R2GlobalCard />
				<R2SiteCard />
			</div>
		</>
	);
}
