import { z } from "zod";

import {
	listSiteUsers,
	mintLoginLink,
	setWpUserPassword,
} from "../core-bridge/wp-users";
import {
	hasControlChar,
	MAX_PASSWORD_LEN,
} from "../core-bridge/wp-users-validate";
import { adminProcedure } from "../procedures";

const MIN_PASSWORD = 8;

// Reject control chars: a newline or NUL would be truncated by the shell before
// WordPress sees it (silent lockout). Shares the core-bridge validator so the
// router's Zod gate and the op's defense-in-depth check can never drift apart.
const password = z
	.string()
	.min(MIN_PASSWORD)
	.max(MAX_PASSWORD_LEN)
	.refine((p) => !hasControlChar(p), {
		message: "Password must not contain control characters",
	});

/**
 * WordPress user management (Plesk WP-Toolkit parity) — admin-only.
 *
 * `siteUsers` lists a site's WordPress users (non-secret fields). `setWpUserPassword`
 * resets a user BY NUMERIC ID (the id from the list — never re-derived from a
 * login, which wp-cli could read as an id/email and hit a different account): the
 * new password travels on STDIN to the root-gated `wp-user-set-password` op
 * (never argv/ps/logs) — see core-bridge/wp-users.ts. Both are admin-tier
 * (WP_ACTION_TIERS): they touch user PII and authenticated access, not routine
 * operator maintenance.
 */
export const wpUsersRouter = {
	siteUsers: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input }) => listSiteUsers(input.siteId)),
	setWpUserPassword: adminProcedure
		.input(
			z.object({
				siteId: z.string(),
				userId: z.number().int().positive(),
				password,
			})
		)
		.handler(async ({ input }) => {
			await setWpUserPassword(input.siteId, input.userId, input.password);
			return { ok: true as const };
		}),
	// Mint a one-click login URL (admin-only). The URL carries a single-use, 60s
	// token and is handed straight to the browser — never logged or persisted.
	wpLoginLink: adminProcedure
		.input(
			z.object({
				siteId: z.string(),
				userId: z.number().int().positive(),
			})
		)
		.handler(({ input }) => mintLoginLink(input.siteId, input.userId)),
};
