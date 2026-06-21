import { Avatar, AvatarFallback } from "@control-panel/ui/components/avatar";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LogIn } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

import { authClient } from "@/lib/auth-client";

export function UserMenu() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-12 w-full" />;
	}

	if (!session) {
		return (
			<SidebarMenuButton
				render={<Link to="/login" />}
				size="lg"
				tooltip="Sign in"
			>
				<LogIn className="size-4" />
				<span>Sign in</span>
			</SidebarMenuButton>
		);
	}

	const displayName = session.user.name || session.user.email || "Account";
	const fallback = displayName.slice(0, 1).toUpperCase() || "V";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton
						className="data-[popup-open]:bg-sidebar-accent"
						size="lg"
						tooltip={displayName}
					/>
				}
			>
				<Avatar className="size-7 rounded-md">
					<AvatarFallback className="rounded-md bg-primary font-bold text-primary-foreground text-xs">
						{fallback}
					</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 text-left leading-tight">
					<span className="truncate font-semibold text-sm">{displayName}</span>
					<span className="truncate text-muted-foreground text-xs">
						{session.user.email}
					</span>
				</div>
				<ChevronsUpDown className="ml-auto size-4 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56 bg-card" side="top">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>{session.user.email}</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										navigate({
											to: "/",
										});
									},
								},
							});
						}}
						variant="destructive"
					>
						Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
