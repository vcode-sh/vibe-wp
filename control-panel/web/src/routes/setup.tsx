import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { SetupWizard } from "@/features/setup/setup-wizard";
import { client } from "@/lib/orpc/client";

export const Route = createFileRoute("/setup")({
	component: SetupWizard,
	// UX guard: once an owner exists, /setup is no longer usable — bounce to
	// /login. The REAL defense is the server-side completeSetup guard; this just
	// keeps the wizard from showing on an already-set-up panel. On a probe
	// failure we fail open to the wizard (a brand-new install is the common case
	// and the server still refuses a duplicate owner).
	beforeLoad: async () => {
		try {
			const { needsSetup } = await client.needsSetup();
			if (!needsSetup) {
				throw redirect({ to: "/login" });
			}
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
		}
	},
});
