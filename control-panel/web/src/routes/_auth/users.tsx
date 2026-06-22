import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserManager } from "@/components/users/user-manager";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/users")({
	// Admin-only. Defense in depth: the server authorizes every admin call too,
	// but non-admins should never see the page.
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (session.data?.user.role !== "admin") {
			throw redirect({ to: "/sites" });
		}
	},
	component: UserManager,
});
