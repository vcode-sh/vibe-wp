import { adminProcedure, operatorProcedure } from "../procedures";

export type Role = "operator" | "admin";

/**
 * Single source of truth for the minimum role each mutating wp action needs.
 * Adjusting a tier or adding an action is a one-line, reviewable change — and the
 * wrapper security review has exactly one place to read the whole policy.
 *
 * Operators own routine maintenance (incl. core update — matching the shipped
 * updatesApply tier) and the safe-update wrapper; admin owns only the two actions
 * with no panel-side undo: delete (install was dropped) and standalone restore.
 */
export const WP_ACTION_TIERS = {
	"plugin.activate": "operator",
	"plugin.deactivate": "operator",
	"plugin.update": "operator",
	"plugin.autoUpdate": "operator",
	"plugin.delete": "admin",
	"theme.activate": "operator",
	"theme.update": "operator",
	"theme.autoUpdate": "operator",
	"theme.delete": "admin",
	"core.update": "operator",
	safeUpdate: "operator",
	"schedule.autoUpdate": "operator",
	// WordPress user management + one-click login (Plesk WP-Toolkit parity). ALL
	// admin-tier: they read user PII (emails), set passwords, create/promote
	// admins, or mint an authenticated wp-admin session — none are routine
	// operator maintenance. Secrets (passwords) travel on STDIN, never argv.
	"user.list": "admin",
	"user.setPassword": "admin",
	"user.create": "admin",
	"user.promote": "admin",
	"user.loginLink": "admin",
} as const satisfies Record<string, Role>;

export type WpAction = keyof typeof WP_ACTION_TIERS;

export function tierFor(action: WpAction): Role {
	return WP_ACTION_TIERS[action];
}

/** Pick the oRPC procedure matching an action's tier (roles are hierarchical). */
export function procedureFor(action: WpAction) {
	return tierFor(action) === "admin" ? adminProcedure : operatorProcedure;
}

/** Slug regex shared with the root wrapper validate_wp_slug (defense-in-depth). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function assertSlug(slug: string, label: string): void {
	if (!SLUG_RE.test(slug)) {
		throw new Error(`Invalid ${label} slug: ${slug}`);
	}
}
