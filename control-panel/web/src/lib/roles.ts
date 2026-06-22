/**
 * Shared panel-role metadata. The three roles mirror the better-auth
 * access-control roles defined once in `packages/auth/src/access.ts`; the server
 * enforces what each can do — this module is only labels/variants/options for the
 * UI. Both the Users manager and any role picker import from here so there is one
 * source of truth.
 */
import type { PanelRole } from "@control-panel/auth/access";

export type { PanelRole } from "@control-panel/auth/access";

export const ROLE_OPTIONS = [
	{ value: "viewer", label: "Viewer", blurb: "Read-only access." },
	{ value: "operator", label: "Operator", blurb: "Run site actions." },
	{ value: "admin", label: "Admin", blurb: "Full access incl. users." },
] as const satisfies readonly {
	value: PanelRole;
	label: string;
	blurb: string;
}[];

export function roleLabel(role: string): string {
	return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function roleVariant(role: string): "default" | "secondary" | "outline" {
	if (role === "admin") {
		return "default";
	}
	if (role === "operator") {
		return "secondary";
	}
	return "outline";
}
