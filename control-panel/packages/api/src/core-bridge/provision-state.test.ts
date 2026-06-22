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

describe("applyAttachStagingOverrides", () => {
	it("targets the existing site dir and enables staging", () => {
		const next = applyAttachStagingOverrides(
			base(),
			"/opt/vibe-wp-sites/shop",
			"shop.io",
			"Stage.Shop.IO"
		);
		expect(next.selectedSiteDir).toBe("/opt/vibe-wp-sites/shop");
		expect(next.installDir).toBe("/opt/vibe-wp-sites/shop");
		expect(next.stagingDomain).toBe("stage.shop.io");
		expect(next.stagingEnabled).toBe(true);
	});
});

describe("applyRemoveSiteOverrides", () => {
	it("maps purge to fullDelete and targets the existing site", () => {
		const purge = applyRemoveSiteOverrides(base(), "/opt/vibe-wp", true);
		expect(purge.fullDelete).toBe(true);
		expect(purge.selectedSiteDir).toBe("/opt/vibe-wp");
		const keep = applyRemoveSiteOverrides(base(), "/opt/vibe-wp", false);
		expect(keep.fullDelete).toBe(false);
	});
});
