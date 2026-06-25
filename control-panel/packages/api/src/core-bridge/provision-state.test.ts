import { describe, expect, it } from "vitest";

import type { InstallerStateLike } from "./provision";
import {
	applyAttachStagingOverrides,
	applyExternalOverrides,
	applyNewSiteOverrides,
	applyRemoveSiteOverrides,
} from "./provision-state";

// A stand-in for the installer-seeded base state. Real values come from the
// installer's baseState bridge; here we only assert the panel's overrides.
function base(): InstallerStateLike {
	return {
		mode: "new-site",
		siteSlug: "shop",
		installDir: "/opt/vibe-wp",
		productionDomain: "shop.io",
		stagingDomain: "stage.shop.io",
		stagingEnabled: false,
		siteTitle: "Shop",
		adminEmail: "",
		performancePreset: "balanced",
		backupSchedule: "daily",
		monitorEnabled: true,
		extDbPassword: "",
		extRedisPassword: "",
		fullDelete: false,
		selectedSiteDir: "",
	};
}

describe("applyNewSiteOverrides", () => {
	it("applies validated identity fields and normalizes domain", () => {
		const next = applyNewSiteOverrides(base(), {
			adminEmail: " owner@real.dev ",
			domain: "Shop.IO",
			stagingEnabled: true,
			stagingDomain: "Stage.Shop.IO",
			performancePreset: "high-memory",
			backupSchedule: "weekly",
			monitorEnabled: false,
			siteTitle: "My Shop",
		});
		expect(next.adminEmail).toBe("owner@real.dev");
		expect(next.productionDomain).toBe("shop.io");
		expect(next.stagingEnabled).toBe(true);
		expect(next.stagingDomain).toBe("stage.shop.io");
		expect(next.performancePreset).toBe("high-memory");
		expect(next.backupSchedule).toBe("weekly");
		expect(next.monitorEnabled).toBe(false);
		expect(next.siteTitle).toBe("My Shop");
		// Installer-computed fields are preserved verbatim.
		expect(next.siteSlug).toBe("shop");
		expect(next.installDir).toBe("/opt/vibe-wp");
	});
	it("leaves staging domain untouched when staging is off", () => {
		const next = applyNewSiteOverrides(base(), {
			adminEmail: "owner@real.dev",
			domain: "shop.io",
			stagingEnabled: false,
			stagingDomain: "should-be-ignored.io",
		});
		expect(next.stagingEnabled).toBe(false);
		expect(next.stagingDomain).toBe("stage.shop.io");
	});

	it("threads optional AI keys into the state (STDIN-bound secrets)", () => {
		const next = applyNewSiteOverrides(base(), {
			adminEmail: "owner@real.dev",
			domain: "shop.io",
			stagingEnabled: false,
			aiOpenAiKey: "sk-openai-test",
			aiGoogleKey: "google-test-key",
			aiAnthropicKey: "anthropic-test-key",
		});
		expect(next.aiOpenAiKey).toBe("sk-openai-test");
		expect(next.aiGoogleKey).toBe("google-test-key");
		expect(next.aiAnthropicKey).toBe("anthropic-test-key");
	});

	it("keeps installer empty-string defaults when AI keys are omitted", () => {
		const next = applyNewSiteOverrides(base(), {
			adminEmail: "owner@real.dev",
			domain: "shop.io",
			stagingEnabled: false,
		});
		// Base seed had no AI keys → never clobber with undefined/empty.
		expect(next.aiOpenAiKey).toBeUndefined();
		expect(next.aiGoogleKey).toBeUndefined();
		expect(next.aiAnthropicKey).toBeUndefined();
	});

	it("does NOT override a base key when only some keys are provided", () => {
		const seeded: InstallerStateLike = {
			...base(),
			aiOpenAiKey: "",
			aiGoogleKey: "",
			aiAnthropicKey: "",
		};
		const next = applyNewSiteOverrides(seeded, {
			adminEmail: "owner@real.dev",
			domain: "shop.io",
			stagingEnabled: false,
			aiOpenAiKey: "sk-only-openai",
		});
		expect(next.aiOpenAiKey).toBe("sk-only-openai");
		// Untouched keys keep the installer's "" default — never undefined.
		expect(next.aiGoogleKey).toBe("");
		expect(next.aiAnthropicKey).toBe("");
	});
});

describe("applyExternalOverrides", () => {
	it("places external secrets into the state object (for STDIN, not argv)", () => {
		const next = applyExternalOverrides(base(), {
			adminEmail: "owner@real.dev",
			domain: "shop.io",
			stagingEnabled: false,
			extDbHost: " db.internal ",
			extDbName: "wordpress",
			extDbPassword: "db-secret",
			extDbUser: "wp",
			extRedisHost: "redis.internal",
			extRedisPassword: "redis-secret",
			extRedisPort: "6379",
		});
		expect(next.extDbHost).toBe("db.internal");
		expect(next.extDbPassword).toBe("db-secret");
		expect(next.extRedisPassword).toBe("redis-secret");
		expect(next.extRedisPort).toBe("6379");
	});
});

// Simulate buildBaseState's NEW-site collision bump: when staging-only /
// remove-existing run against a live site, baseState sees the live site as
// "taken" and BUMPS the slug. The overrides MUST pin the real slug back.
function bumpedBase(): InstallerStateLike {
	return { ...base(), siteSlug: "shop-io-2" };
}

describe("applyAttachStagingOverrides", () => {
	it("pins the real slug, targets the existing site, enables staging", () => {
		const next = applyAttachStagingOverrides(
			bumpedBase(),
			{
				slug: "shop-io",
				installDir: "/opt/vibe-wp-sites/shop",
				productionDomain: "shop.io",
				hasStaging: false,
				stagingDomain: null,
			},
			"Stage.Shop.IO"
		);
		// Real slug pinned — NOT the bumped baseState slug.
		expect(next.siteSlug).toBe("shop-io");
		expect(next.selectedSiteDir).toBe("/opt/vibe-wp-sites/shop");
		expect(next.installDir).toBe("/opt/vibe-wp-sites/shop");
		expect(next.stagingDomain).toBe("stage.shop.io");
		expect(next.stagingEnabled).toBe(true);
	});
});

describe("applyRemoveSiteOverrides", () => {
	it("pins the real slug and the site's REAL staging presence", () => {
		const next = applyRemoveSiteOverrides(
			bumpedBase(),
			{
				slug: "shop-io",
				installDir: "/opt/vibe-wp",
				productionDomain: "shop.io",
				hasStaging: true,
				stagingDomain: "stage.shop.io",
			},
			true
		);
		// The Caddy snippet + compose project must use the real slug.
		expect(next.siteSlug).toBe("shop-io");
		expect(next.selectedSiteDir).toBe("/opt/vibe-wp");
		// Real staging presence → buildRemoveTasks emits stage-down + -stage.caddy.
		expect(next.stagingEnabled).toBe(true);
		expect(next.stagingDomain).toBe("stage.shop.io");
		expect(next.fullDelete).toBe(true);
	});

	it("skips staging teardown when the site has no staging", () => {
		const next = applyRemoveSiteOverrides(
			base(),
			{
				slug: "lonely",
				installDir: "/opt/vibe-wp",
				productionDomain: "lonely.io",
				hasStaging: false,
				stagingDomain: null,
			},
			false
		);
		expect(next.siteSlug).toBe("lonely");
		expect(next.stagingEnabled).toBe(false);
		expect(next.fullDelete).toBe(false);
	});
});
