/**
 * Pure client-side shaping of the panel-user list. Panel user counts are tiny, so
 * the manager fetches all users once (`listUsers`) and filters/sorts/paginates in
 * the browser via these helpers — kept pure so they are trivially testable.
 */
import type { PanelRole } from "@/lib/roles";

export interface PanelUser {
	id: string;
	email: string;
	name: string;
	role: string;
	banned: boolean;
	banReason: string | null;
	createdAt: number;
}

export interface UserFilter {
	query: string;
	role: "all" | PanelRole;
	status: "all" | "active" | "banned";
}

export function filterUsers(users: PanelUser[], f: UserFilter): PanelUser[] {
	const q = f.query.trim().toLowerCase();
	return users.filter((u) => {
		if (q && !`${u.email} ${u.name}`.toLowerCase().includes(q)) {
			return false;
		}
		if (f.role !== "all" && u.role !== f.role) {
			return false;
		}
		if (f.status === "banned" && !u.banned) {
			return false;
		}
		if (f.status === "active" && u.banned) {
			return false;
		}
		return true;
	});
}

const RANK: Record<string, number> = { admin: 0, operator: 1, viewer: 2 };

export function sortUsers(users: PanelUser[]): PanelUser[] {
	return [...users].sort((a, b) => {
		const ra = RANK[a.role] ?? 9;
		const rb = RANK[b.role] ?? 9;
		if (ra !== rb) {
			return ra - rb;
		}
		return a.email.localeCompare(b.email);
	});
}

export function paginate<T>(
	items: T[],
	page: number,
	pageSize: number
): { page: number; pageCount: number; slice: T[] } {
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
	const safe = Math.min(Math.max(0, page), pageCount - 1);
	return {
		page: safe,
		pageCount,
		slice: items.slice(safe * pageSize, safe * pageSize + pageSize),
	};
}
