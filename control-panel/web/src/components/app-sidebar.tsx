import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@control-panel/ui/components/sidebar";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import {
	Activity,
	CopyCheck,
	HeartPulse,
	LayoutDashboard,
	ScrollText,
	Settings,
	ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

import { SiteSwitcher } from "@/components/site-switcher";
import { UserMenu } from "@/components/user-menu";

interface SiteLink {
	icon: ComponentType<{ className?: string }>;
	label: string;
	to: string;
}

const SITE_LINKS: SiteLink[] = [
	{ label: "Overview", to: "/sites/$siteId/overview", icon: LayoutDashboard },
	{ label: "Health", to: "/sites/$siteId/health", icon: HeartPulse },
	{ label: "Backups", to: "/sites/$siteId/backups", icon: CopyCheck },
	{ label: "Logs", to: "/sites/$siteId/logs", icon: ScrollText },
	{ label: "Staging", to: "/sites/$siteId/staging", icon: Activity },
];

const SERVER_LINKS: SiteLink[] = [
	{ label: "Server & security", to: "/server", icon: ShieldCheck },
	{ label: "Settings", to: "/settings", icon: Settings },
];

export function AppSidebar() {
	const params = useParams({ strict: false });
	const siteId = params.siteId;
	const matchRoute = useMatchRoute();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SiteSwitcher activeSiteId={siteId} />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{siteId ? (
					<SidebarGroup>
						<SidebarGroupLabel>This site</SidebarGroupLabel>
						<SidebarMenu>
							{SITE_LINKS.map(({ label, to, icon: Icon }) => (
								<SidebarMenuItem key={to}>
									<SidebarMenuButton
										isActive={Boolean(matchRoute({ to, params: { siteId } }))}
										render={<Link params={{ siteId }} to={to} />}
										tooltip={label}
									>
										<Icon className="size-4" />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				) : null}

				<SidebarGroup>
					<SidebarGroupLabel>Server</SidebarGroupLabel>
					<SidebarMenu>
						{SERVER_LINKS.map(({ label, to, icon: Icon }) => (
							<SidebarMenuItem key={to}>
								<SidebarMenuButton
									isActive={Boolean(matchRoute({ to }))}
									render={<Link to={to} />}
									tooltip={label}
								>
									<Icon className="size-4" />
									<span>{label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<UserMenu />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
