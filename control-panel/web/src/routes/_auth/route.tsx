import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenuLauncher } from "@/components/command-menu-launcher";
import { ActiveOperationDialog } from "@/components/patterns/active-operation-dialog";
import { OperationsTray } from "@/components/patterns/operations-tray";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { OperationsProvider } from "@/lib/operations/operations-provider";
import { client } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			// No session. On a brand-new install (no owner yet) send the visitor
			// straight into onboarding; otherwise to the sign-in page. The
			// needsSetup probe is best-effort — fall back to /login on any error.
			let needsSetup = false;
			try {
				needsSetup = (await client.needsSetup()).needsSetup;
			} catch {
				needsSetup = false;
			}
			throw redirect({ to: needsSetup ? "/setup" : "/login" });
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
