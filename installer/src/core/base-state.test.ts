import { describe, expect, test } from "bun:test";
import { buildBaseState } from "./base-state";
import { emptyHostFacts } from "./defaults";
import { portPairFromSlug, siteSlugFromDomain } from "./site-profile";
import type { ExistingSite, HostFacts } from "./types";

function siteAt(installDir: string): ExistingSite {
  return {
    installDir,
    productionUrl: "https://example-prod.test",
    stagingUrl: null,
    productionProject: null,
    stagingProject: null,
    hasStaging: false
  };
}

function hostWith(sites: ExistingSite[]): HostFacts {
  return { ...emptyHostFacts(), existingSites: sites };
}

describe("buildBaseState identity seeding", () => {
  test("seeds slug, ports, dir, title, staging from the domain for a fresh host", () => {
    const state = buildBaseState(emptyHostFacts(), { domain: "shop.io", mode: "new-site" });
    expect(state.mode).toBe("new-site");
    expect(state.siteSlug).toBe(siteSlugFromDomain("shop.io"));
    expect(state.installDir).toBe("/opt/vibe-wp");
    expect(state.productionDomain).toBe("shop.io");
    expect(state.stagingDomain).toBe("stage.shop.io");
    expect(state.siteTitle).toBe("Shop");
    // Provisioning always starts a NEW site: never adopt an existing one.
    expect(state.selectedSiteDir).toBe("");
    expect(state.adminEmail).toBe("");
    expect(state.stagingEnabled).toBe(false);
    const ports = portPairFromSlug(state.siteSlug);
    expect(state.productionHttpPort).toBe(ports.production);
    expect(state.stagingHttpPort).toBe(ports.staging);
  });

  test("never adopts the first existing site (defaultState's manage branch)", () => {
    const host = hostWith([siteAt("/opt/vibe-wp")]);
    const state = buildBaseState(host, { domain: "newone.dev", mode: "new-site" });
    expect(state.mode).toBe("new-site");
    expect(state.selectedSiteDir).toBe("");
    expect(state.installDir).not.toBe("/opt/vibe-wp");
  });

  test("installDir avoids colliding with an existing site of the same slug", () => {
    // An existing site already lives where this slug's first dir would land.
    const host = hostWith([siteAt("/opt/vibe-wp"), siteAt("/opt/vibe-wp-sites/shop")]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.installDir).not.toBe("/opt/vibe-wp-sites/shop");
    expect(state.installDir).not.toBe("/opt/vibe-wp");
    // Slug also disambiguates against the taken "shop".
    expect(state.siteSlug).not.toBe("shop");
  });

  test("ports do not collide with an existing site's reserved pair", () => {
    const existingSlug = siteSlugFromDomain("shop.io");
    const reserved = portPairFromSlug(existingSlug);
    const host = hostWith([siteAt("/opt/vibe-wp"), siteAt(`/opt/vibe-wp-sites/${existingSlug}`)]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.productionHttpPort).not.toBe(reserved.production);
    expect(state.stagingHttpPort).not.toBe(reserved.staging);
    expect(state.productionHttpPort).not.toBe(state.stagingHttpPort);
  });

  test("external-services mode is preserved", () => {
    const state = buildBaseState(emptyHostFacts(), {
      domain: "ext.app",
      mode: "external-services"
    });
    expect(state.mode).toBe("external-services");
  });

  test("missing domain falls back to a safe default slug", () => {
    const state = buildBaseState(emptyHostFacts(), { mode: "new-site" });
    expect(state.siteSlug).toBe("site");
  });
});
