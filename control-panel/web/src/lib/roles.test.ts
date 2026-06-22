import { describe, expect, it } from "vitest";
import { ROLE_OPTIONS, roleLabel, roleVariant } from "./roles";

describe("roles", () => {
	it("lists three roles in privilege order", () => {
		expect(ROLE_OPTIONS.map((r) => r.value)).toEqual([
			"viewer",
			"operator",
			"admin",
		]);
	});
	it("labels known roles and falls back to the raw value", () => {
		expect(roleLabel("admin")).toBe("Admin");
		expect(roleLabel("operator")).toBe("Operator");
		expect(roleLabel("mystery")).toBe("mystery");
	});
	it("maps roles to badge variants", () => {
		expect(roleVariant("admin")).toBe("default");
		expect(roleVariant("operator")).toBe("secondary");
		expect(roleVariant("viewer")).toBe("outline");
		expect(roleVariant("mystery")).toBe("outline");
	});
});
