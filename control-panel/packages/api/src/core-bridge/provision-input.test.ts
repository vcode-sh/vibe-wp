import { describe, expect, it } from "vitest";

import {
	attachStagingSchema,
	createExternalSchema,
	createSiteSchema,
	removeSiteSchema,
	validateDomainValue,
} from "./provision-input";

const validSite = {
	adminEmail: "owner@real-domain.dev",
	domain: "real-domain.dev",
	stagingEnabled: false,
};

describe("validateDomainValue mirrors the installer", () => {
	it("rejects example.com and friends", () => {
		expect(validateDomainValue("example.com")).not.toBeNull();
		expect(validateDomainValue("foo.example.com")).not.toBeNull();
		expect(validateDomainValue("foo.test")).not.toBeNull();
		expect(validateDomainValue("localhost")).not.toBeNull();
	});
	it("rejects protocols and dotless hosts", () => {
		expect(validateDomainValue("https://shop.io")).not.toBeNull();
		expect(validateDomainValue("nodot")).not.toBeNull();
	});
	it("accepts a real domain", () => {
		expect(validateDomainValue("shop.io")).toBeNull();
	});
});

describe("createSiteSchema", () => {
	it("accepts a minimal valid site", () => {
		expect(createSiteSchema.safeParse(validSite).success).toBe(true);
	});
	it("rejects example.com domains", () => {
		const r = createSiteSchema.safeParse({
			...validSite,
			domain: "example.com",
		});
		expect(r.success).toBe(false);
	});
	it("rejects @example.com admin email", () => {
		const r = createSiteSchema.safeParse({
			...validSite,
			adminEmail: "owner@example.com",
		});
		expect(r.success).toBe(false);
	});
	it("requires a staging domain when staging is enabled", () => {
		const r = createSiteSchema.safeParse({
			...validSite,
			stagingEnabled: true,
		});
		expect(r.success).toBe(false);
	});
	it("rejects a staging domain equal to production", () => {
		const r = createSiteSchema.safeParse({
			...validSite,
			stagingEnabled: true,
			stagingDomain: validSite.domain,
		});
		expect(r.success).toBe(false);
	});
	it("accepts a distinct staging domain", () => {
		const r = createSiteSchema.safeParse({
			...validSite,
			stagingEnabled: true,
			stagingDomain: "stage.real-domain.dev",
		});
		expect(r.success).toBe(true);
	});
});

describe("createExternalSchema", () => {
	const ext = {
		...validSite,
		extDbHost: "db.internal",
		extDbName: "wordpress",
		extDbPassword: "db-secret",
		extDbUser: "wp",
		extRedisHost: "redis.internal",
		extRedisPassword: "redis-secret",
		extRedisPort: "6379",
	};
	it("accepts valid external credentials", () => {
		expect(createExternalSchema.safeParse(ext).success).toBe(true);
	});
	it("rejects an out-of-range Redis port", () => {
		expect(
			createExternalSchema.safeParse({ ...ext, extRedisPort: "70000" }).success
		).toBe(false);
		expect(
			createExternalSchema.safeParse({ ...ext, extRedisPort: "80" }).success
		).toBe(false);
	});
	it("rejects an empty DB password", () => {
		expect(
			createExternalSchema.safeParse({ ...ext, extDbPassword: "" }).success
		).toBe(false);
	});
});

describe("attachStagingSchema", () => {
	it("requires a valid, real staging domain", () => {
		expect(
			attachStagingSchema.safeParse({
				siteId: "s1",
				stagingDomain: "stage.shop.io",
			}).success
		).toBe(true);
		expect(
			attachStagingSchema.safeParse({
				siteId: "s1",
				stagingDomain: "example.com",
			}).success
		).toBe(false);
	});
});

describe("removeSiteSchema", () => {
	it("requires an explicit purge boolean", () => {
		expect(
			removeSiteSchema.safeParse({ siteId: "s1", purge: true }).success
		).toBe(true);
		expect(
			removeSiteSchema.safeParse({ siteId: "s1" } as unknown).success
		).toBe(false);
	});
});
