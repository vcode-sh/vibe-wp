import { describe, expect, it } from "vitest";

import { deriveSteps, type StepDef } from "./steps";

const DEFS: StepDef[] = [
	{ match: /Dumping/, label: "Database" },
	{ match: /Archiving/, label: "Files" },
	{ match: /Uploading/, label: "Upload" },
];

describe("deriveSteps", () => {
	it("marks matched-then-passed steps done, the latest match active, the rest pending", () => {
		const steps = deriveSteps(["Dumping x", "Archiving y"], DEFS);
		expect(steps).toEqual([
			{ label: "Database", state: "done" },
			{ label: "Files", state: "active" },
			{ label: "Upload", state: "pending" },
		]);
	});
	it("all pending before any match", () => {
		expect(deriveSteps([], DEFS).every((s) => s.state === "pending")).toBe(
			true
		);
	});
});
