import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenuLauncher } from "@/components/command-menu-launcher";
import { ActiveOperationDialog } from "@/components/patterns/active-operation-dialog";
import { OperationsTray } from "@/components/patterns/operations-tray";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { OperationsProvider } from "@/lib/operations/operations-provider";

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
		<OperationsProvider>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset>
					<CommandMenuLauncher />
					<Outlet />
				</SidebarInset>
			</SidebarProvider>
			<OperationsTray />
			<ActiveOperationDialog />
		</OperationsProvider>
	);
}
