import { Avatar, AvatarFallback } from "@control-panel/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@control-panel/ui/components/dropdown-menu";
import { SidebarMenuButton } from "@control-panel/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Plus } from "lucide-react";

import { sitesQuery } from "@/data/queries";

export function SiteSwitcher({ activeSiteId }: { activeSiteId?: string }) {
	const navigate = useNavigate();
	const sites = useQuery(sitesQuery());
	const active = sites.data?.find((s) => s.id === activeSiteId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton
						className="data-[state=open]:bg-sidebar-accent"
						size="lg"
					/>
				}
			>
				<Avatar className="size-7 rounded-md">
					<AvatarFallback className="rounded-md bg-primary font-bold text-primary-foreground text-xs">
						{(active?.name ?? "V").slice(0, 1).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 text-left leading-tight">
					<span className="truncate font-semibold text-sm">
						{active?.name ?? "All sites"}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{active?.domain ?? "select a site"}
					</span>
				</div>
				<ChevronsUpDown className="ml-auto size-4 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel>Sites</DropdownMenuLabel>
				{sites.data?.map((s) => (
					<DropdownMenuItem
						key={s.id}
						onClick={() =>
							navigate({
								to: "/sites/$siteId/overview",
								params: { siteId: s.id },
							})
						}
					>
						{s.name}
						<span className="ml-auto text-muted-foreground text-xs">
							{s.domain}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => navigate({ to: "/sites" })}>
					All sites
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => navigate({ to: "/sites" })}>
					<Plus className="size-4" /> New site
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
