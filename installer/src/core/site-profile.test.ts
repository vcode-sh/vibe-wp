import { expect, test } from "bun:test";
import { stagingDomainFor, titleFromDomain } from "./site-profile";

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
