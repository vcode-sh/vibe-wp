import { expect, test } from "bun:test";
import { shortPath, stagingDomainFor, titleFromDomain } from "./site-profile";

test("stagingDomainFor prefixes stage. and strips protocol/trailing slash", () => {
  expect(stagingDomainFor("https://shop.com/")).toBe("stage.shop.com");
  expect(stagingDomainFor("Shop.COM")).toBe("stage.shop.com");
  expect(stagingDomainFor("")).toBe("");
});

test("titleFromDomain guesses a friendly title from the host label", () => {
  expect(titleFromDomain("my-shop.com")).toBe("My Shop");
  expect(titleFromDomain("https://acme.io")).toBe("Acme");
  expect(titleFromDomain("blog_site.net")).toBe("Blog Site");
});

test("shortPath keeps the meaningful tail of long paths, leaves short ones alone", () => {
  expect(shortPath("/opt/vibe-wp")).toBe("/opt/vibe-wp");
  expect(shortPath("/opt/vibe-wp-sites/demo")).toBe("/opt/vibe-wp-sites/demo");
  expect(shortPath("/Users/me/_projects_/vibe-wp/installer/.vibe-local/sites/acme")).toBe(
    "…/sites/acme"
  );
  expect(shortPath("/var/backups/vibe-wp/demo-vibe-local")).toBe("…/vibe-wp/demo-vibe-local");
});
