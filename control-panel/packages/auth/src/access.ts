/**
 * Access-control definitions shared by the better-auth server (packages/auth)
 * and the web admin client (web/src/lib/auth-client.ts). This module imports
 * ONLY browser-safe better-auth helpers — no db, env, or other server code — so
 * the web bundle can import the same `ac`/`roles` the server builds. Keeping a
 * single source means the client's `admin.setRole`/`createUser` role argument
 * is typed exactly as the server enforces (viewer/operator/admin).
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl({
	...defaultStatements,
	site: ["read", "operate", "manage"],
	server: ["read", "manage"],
	team: ["manage"],
});

export const roles = {
	viewer: ac.newRole({ site: ["read"], server: ["read"] }),
	operator: ac.newRole({ site: ["read", "operate"], server: ["read"] }),
	admin: ac.newRole({
		...adminAc.statements,
		site: ["read", "operate", "manage"],
		server: ["read", "manage"],
		team: ["manage"],
	}),
};

export const PANEL_ROLES = ["viewer", "operator", "admin"] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];
