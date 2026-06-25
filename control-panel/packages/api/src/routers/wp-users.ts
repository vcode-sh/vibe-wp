import { z } from "zod";

import { listSiteUsers, setWpUserPassword } from "../core-bridge/wp-users";
import { adminProcedure } from "../procedures";

/**
 * WordPress user management (Plesk WP-Toolkit parity) — admin-only.
 *
 * `siteUsers` lists a site's WordPress users (non-secret fields). `setWpUserPassword`
 * resets a user's password: the new password travels on STDIN to the root-gated
 * `wp-user-set-password` op (never argv/ps/logs) — see core-bridge/wp-users.ts.
 * Both are admin-tier (WP_ACTION_TIERS): they touch user PII and authenticated
 * access, not routine operator maintenance.
 */
export const wpUsersRouter = {
	siteUsers: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input }) => listSiteUsers(input.siteId)),
	setWpUserPassword: adminProcedure
		.input(
			z.object({
				siteId: z.string(),
				login: z.string().min(1).max(60),
				password: z.string().min(8).max(200),
			})
		)
		.handler(async ({ input }) => {
			await setWpUserPassword(input.siteId, input.login, input.password);
			return { ok: true as const };
		}),
};
