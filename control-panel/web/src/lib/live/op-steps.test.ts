import { describe, expect, it } from "vitest";

import { GENERIC_STEPS, OP_STEPS } from "./op-steps";
import { deriveSteps } from "./steps";

/**
 * The provision job kinds drive deriveSteps with the per-task lines streamProvision
 * emits: `[running] <title>` on start and `[<status>] <title>` on result, where
 * <title> is the installer task's `title`. These tests feed those exact line shapes
 * and assert the matchers light up named step rows in the right order.
 */
describe("OP_STEPS provision rails", () => {
	it("registers rails for every provision job kind", () => {
		expect(OP_STEPS.provision).toBeDefined();
		expect(OP_STEPS.attachStaging).toBeDefined();
		expect(OP_STEPS.removeSite).toBeDefined();
	});

	it("maps new-site task lines to named steps in order", () => {
		const lines = [
			"[running] Verify DNS points to this VPS",
			"[done] Verify DNS points to this VPS",
			"[running] Prepare Vibe WP checkout",
			"[done] Prepare Vibe WP checkout",
			"[running] Install WordPress",
		];
		const steps = deriveSteps(lines, OP_STEPS.provision ?? GENERIC_STEPS);
		const byLabel = Object.fromEntries(steps.map((s) => [s.label, s.state]));
		// DNS + checkout completed, Install WordPress is the latest match => active.
		expect(byLabel["Checking DNS"]).toBe("done");
		expect(byLabel["Fetching Vibe WP"]).toBe("done");
		expect(byLabel["Installing WordPress"]).toBe("active");
		// A later step that never appeared stays pending.
		expect(byLabel["Performance report"]).toBe("pending");
	});

	it("matches external-services task titles on the shared provision rail", () => {
		const lines = [
			"[running] Generate external environment",
			"[running] Start WordPress and Nginx",
			"[running] Run smoke test",
		];
		const steps = deriveSteps(lines, OP_STEPS.provision ?? GENERIC_STEPS);
		const active = steps.find((s) => s.state === "active");
		// The latest matched title ("Run smoke test") is the active row.
		expect(active?.label).toBe("Running smoke test");
		expect(steps.find((s) => s.label === "Writing environment")?.state).toBe(
			"done"
		);
		expect(steps.find((s) => s.label === "Starting containers")?.state).toBe(
			"done"
		);
	});

	it("maps attachStaging task lines to staging steps", () => {
		const lines = [
			"[done] Generate staging environment",
			"[running] Add staging HTTPS route",
		];
		const steps = deriveSteps(lines, OP_STEPS.attachStaging ?? GENERIC_STEPS);
		expect(steps.find((s) => s.label === "Writing staging env")?.state).toBe(
			"done"
		);
		expect(steps.find((s) => s.label === "Adding HTTPS route")?.state).toBe(
			"active"
		);
	});

	it("maps removeSite purge + non-purge HTTPS route titles", () => {
		const purge = deriveSteps(
			["[running] Remove HTTPS route"],
			OP_STEPS.removeSite ?? GENERIC_STEPS
		);
		const keep = deriveSteps(
			["[running] Disable HTTPS route"],
			OP_STEPS.removeSite ?? GENERIC_STEPS
		);
		expect(purge.find((s) => s.label === "Removing HTTPS route")?.state).toBe(
			"active"
		);
		expect(keep.find((s) => s.label === "Removing HTTPS route")?.state).toBe(
			"active"
		);
	});
});
