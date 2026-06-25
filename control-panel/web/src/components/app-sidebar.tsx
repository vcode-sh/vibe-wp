import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import {
	Activity,
	CopyCheck,
	Gauge,
	HeartPulse,
	History,
	LayoutDashboard,
	PackageOpen,
	ScrollText,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
	UsersRound,
} from "lucide-react";
import type { ComponentType } from "react";
import { SiteSwitcher } from "@/components/site-switcher";
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
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";
import { authClient } from "@/lib/auth-client";

interface SiteLink {
	icon: ComponentType<{ className?: string }>;
	label: string;
	to: string;
}

const SITE_LINKS: SiteLink[] = [
	{ label: "Overview", to: "/sites/$siteId/overview", icon: LayoutDashboard },
	{ label: "Health", to: "/sites/$siteId/health", icon: HeartPulse },
	{ label: "Monitoring", to: "/sites/$siteId/monitoring", icon: Gauge },
	{ label: "Backups", to: "/sites/$siteId/backups", icon: CopyCheck },
	{ label: "Logs", to: "/sites/$siteId/logs", icon: ScrollText },
	{ label: "Inventory", to: "/sites/$siteId/inventory", icon: PackageOpen },
	{ label: "Users", to: "/sites/$siteId/users", icon: UsersRound },
	{ label: "Staging", to: "/sites/$siteId/staging", icon: Activity },
	{
		label: "Site settings",
		to: "/sites/$siteId/settings",
		icon: SlidersHorizontal,
	},
];

const SERVER_LINKS: SiteLink[] = [
	{ label: "Monitoring", to: "/monitoring", icon: Gauge },
	{ label: "Operations", to: "/operations", icon: History },
	{ label: "Server & security", to: "/server", icon: ShieldCheck },
	{ label: "Settings", to: "/settings", icon: Settings },
];

const ADMIN_LINK: SiteLink = { label: "Users", to: "/users", icon: UsersRound };

export function AppSidebar() {
	const params = useParams({ strict: false });
	const siteId = params.siteId;
	const matchRoute = useMatchRoute();
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	// Users is admin-only; insert it before Settings for admins.
	const serverLinks = isAdmin
		? [
				...SERVER_LINKS.slice(0, -1),
				ADMIN_LINK,
				SERVER_LINKS.at(-1) as SiteLink,
			]
		: SERVER_LINKS;

	return (
		<Sidebar collapsible="icon" variant="inset">
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
						{serverLinks.map(({ label, to, icon: Icon }) => (
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
