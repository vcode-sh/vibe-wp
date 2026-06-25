import { describe, expect, test } from "bun:test";
import { suggestedBackupDir } from "./backup";
import { buildBaseState } from "./base-state";
import { emptyHostFacts } from "./defaults";
import { portPairFromSlug, siteSlugFromDomain } from "./site-profile";
import type { ExistingSite, HostFacts } from "./types";

function siteAt(
  installDir: string,
  ports: {
    production?: number | null;
    staging?: number | null;
    productionProject?: string | null;
    stagingProject?: string | null;
  } = {}
): ExistingSite {
  return {
    installDir,
    productionUrl: "https://example-prod.test",
    stagingUrl: null,
    productionPort: ports.production ?? null,
    stagingPort: ports.staging ?? null,
    productionProject: ports.productionProject ?? null,
    stagingProject: ports.stagingProject ?? null,
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

  test("ports walk away from an existing site's REAL bound ports", () => {
    // The new site's slug-derived pair is what an unconstrained host would pick;
    // reserve exactly those real ports on a different existing site so the new
    // provision is forced to walk forward. (Real ports, not slug-reconstructed —
    // a site created after a prior collision runs on a walked port.)
    const newSlug = siteSlugFromDomain("shop.io");
    const wouldPick = portPairFromSlug(newSlug);
    const host = hostWith([
      siteAt("/opt/vibe-wp", {
        production: Number(wouldPick.production),
        staging: Number(wouldPick.staging)
      })
    ]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.productionHttpPort).not.toBe(wouldPick.production);
    expect(state.stagingHttpPort).not.toBe(wouldPick.staging);
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

  test("slug avoids collision with an existing site's REAL compose project name", () => {
    // The conventional first site lives at /opt/vibe-wp (basename "vibe-wp"),
    // but its REAL slug is carried in COMPOSE_PROJECT_NAME = vibe-wp-shop-prod.
    // A new "shop.io" provision must NOT reuse that slug, or both would share
    // COMPOSE_PROJECT_NAME vibe-wp-shop-prod and clobber each other's containers.
    const host = hostWith([siteAt("/opt/vibe-wp", { productionProject: "vibe-wp-shop-prod" })]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.siteSlug).not.toBe("shop");
  });

  test("slug + install dir avoid collision with an existing SHARED-DB site", () => {
    // A shared-database site's project is vibe-wp-<slug>-shared-db (no prod.env).
    // Before the fix the -shared-db suffix was not stripped, so its slug looked
    // free: a new same-domain site could reuse the slug — or, since the first
    // site lives at /opt/vibe-wp, land on the SAME dir and overwrite it.
    const host = hostWith([
      siteAt("/opt/vibe-wp", { productionProject: "vibe-wp-shop-shared-db" })
    ]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.siteSlug).not.toBe("shop");
    expect(state.installDir).not.toBe("/opt/vibe-wp");
  });

  test("slug avoids collision with an existing site's staging project name", () => {
    const host = hostWith([
      siteAt("/opt/vibe-wp", {
        productionProject: "vibe-wp-main-prod",
        stagingProject: "vibe-wp-shop-stage"
      })
    ]);
    const state = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(state.siteSlug).not.toBe("shop");
  });

  test("backupDir is per-slug, never the inherited example.com default", () => {
    const state = buildBaseState(emptyHostFacts(), { domain: "shop.io", mode: "new-site" });
    expect(state.backupDir).toBe(suggestedBackupDir(state.siteSlug));
    // Must not inherit defaultState's literal example.com-derived backup dir.
    expect(state.backupDir).not.toBe(suggestedBackupDir(siteSlugFromDomain("example.com")));
  });

  test("two sequential provisions get distinct slugs AND distinct backup dirs", () => {
    const first = buildBaseState(emptyHostFacts(), { domain: "shop.io", mode: "new-site" });
    // Simulate the first site now installed with its real compose project name.
    const host = hostWith([
      siteAt(first.installDir, { productionProject: `vibe-wp-${first.siteSlug}-prod` })
    ]);
    const second = buildBaseState(host, { domain: "shop.io", mode: "new-site" });
    expect(second.siteSlug).not.toBe(first.siteSlug);
    expect(second.backupDir).not.toBe(first.backupDir);
  });

  test("port exhaustion fails closed with an invalid pair, not a colliding one", () => {
    // Reserve EVERY port from the slug's start to MAX so the 2-step walk can
    // never find a free pair. The result must be out-of-range (rejected by
    // validateState), never the original slug-derived colliding pair.
    const slug = siteSlugFromDomain("shop.io");
    const start = Number(portPairFromSlug(slug).production);
    const sites: ExistingSite[] = [];
    for (let port = start; port <= 65_535; port += 1) {
      sites.push(siteAt(`/opt/vibe-wp-sites/r-${port}`, { production: port }));
    }
    const state = buildBaseState(hostWith(sites), { domain: "shop.io", mode: "new-site" });
    const wouldPick = portPairFromSlug(state.siteSlug);
    const prodNum = Number(state.productionHttpPort);
    // Out of the valid 1024-65535 range => validateState rejects the provision.
    expect(prodNum < 1024 || prodNum > 65_535).toBe(true);
    // And it is NOT the original colliding pair.
    expect(state.productionHttpPort).not.toBe(wouldPick.production);
  });
});
