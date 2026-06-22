import { describe, expect, it } from "vitest";

import { actionToKind, auditToActivity } from "./audit";

describe("actionToKind", () => {
	it("maps actions to ActivityEntry kinds", () => {
		expect(actionToKind("backup")).toBe("backup");
		expect(actionToKind("restore")).toBe("backup");
		expect(actionToKind("cacheFlush")).toBe("cache");
		expect(actionToKind("harden")).toBe("deploy");
		expect(actionToKind("wpUpdate")).toBe("update");
		expect(actionToKind("something-else")).toBe("deploy");
	});
});

describe("auditToActivity", () => {
	it("maps an audit row into an ActivityEntry", () => {
		const out = auditToActivity([
			{
				id: "1",
				action: "backup",
				siteId: "acme",
				jobId: "j1",
				at: new Date("2026-06-22T10:00:00Z"),
			},
		]);
		expect(out[0]).toMatchObject({ id: "1", kind: "backup", good: true });
		expect(out[0]?.text).toBe("Backed up");
	});
	it("preserves input order (sorting is the db's job, not this map)", () => {
		const out = auditToActivity([
			{
				id: "a",
				action: "harden",
				siteId: "acme",
				jobId: null,
				at: new Date("2026-06-22T12:00:00Z"),
			},
			{
				id: "b",
				action: "restore",
				siteId: "acme",
				jobId: null,
				at: new Date("2026-06-22T09:00:00Z"),
			},
		]);
		expect(out.map((e) => e.id)).toEqual(["a", "b"]);
	});
});
