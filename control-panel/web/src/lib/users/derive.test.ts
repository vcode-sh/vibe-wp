import { describe, expect, it } from "vitest";
import { filterUsers, type PanelUser, paginate, sortUsers } from "./derive";

const u = (over: Partial<PanelUser>): PanelUser => ({
	id: "1",
	email: "a@x.com",
	name: "Alice",
	role: "viewer",
	banned: false,
	banReason: null,
	createdAt: 0,
	...over,
});

describe("filterUsers", () => {
	const users = [
		u({ id: "1", email: "alice@x.com", name: "Alice", role: "admin" }),
		u({
			id: "2",
			email: "bob@x.com",
			name: "Bob",
			role: "viewer",
			banned: true,
		}),
		u({ id: "3", email: "carol@y.com", name: "Carol", role: "operator" }),
	];
	it("matches query on email and name, case-insensitive", () => {
		expect(
			filterUsers(users, { query: "BOB", role: "all", status: "all" }).map(
				(x) => x.id
			)
		).toEqual(["2"]);
		expect(
			filterUsers(users, { query: "carol", role: "all", status: "all" }).map(
				(x) => x.id
			)
		).toEqual(["3"]);
	});
	it("filters by role", () => {
		expect(
			filterUsers(users, { query: "", role: "admin", status: "all" }).map(
				(x) => x.id
			)
		).toEqual(["1"]);
	});
	it("filters by status", () => {
		expect(
			filterUsers(users, { query: "", role: "all", status: "banned" }).map(
				(x) => x.id
			)
		).toEqual(["2"]);
		expect(
			filterUsers(users, { query: "", role: "all", status: "active" }).map(
				(x) => x.id
			)
		).toEqual(["1", "3"]);
	});
});

describe("sortUsers", () => {
	it("puts admins first then sorts by email", () => {
		const users = [
			u({ id: "1", email: "z@x.com", role: "viewer" }),
			u({ id: "2", email: "a@x.com", role: "admin" }),
			u({ id: "3", email: "b@x.com", role: "viewer" }),
		];
		expect(sortUsers(users).map((x) => x.id)).toEqual(["2", "3", "1"]);
	});
});

describe("paginate", () => {
	it("slices and reports page count", () => {
		const items = [1, 2, 3, 4, 5];
		expect(paginate(items, 1, 2)).toEqual({
			page: 1,
			pageCount: 3,
			slice: [3, 4],
		});
	});
	it("clamps out-of-range page to the last page", () => {
		expect(paginate([1, 2, 3], 9, 2).page).toBe(1);
	});
});
