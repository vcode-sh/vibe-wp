import {
	SidebarInset,
	SidebarProvider,
} from "@control-panel/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function AuthLayout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<CommandMenu />
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}
