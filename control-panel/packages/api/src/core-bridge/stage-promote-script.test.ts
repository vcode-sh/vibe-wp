import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(here, "../../../../../bin/stage-promote-files");
const source = readFileSync(SCRIPT, "utf8");

describe("stage-promote-files script", () => {
	it("normalizes managed wp-content ownership before restart and smoke", () => {
		const extract = source.indexOf("tar -xzf - -C /var/www/html/wp-content");
		const chown = source.indexOf("chown -R www-data:www-data");
		const chmodDir = source.indexOf("chmod 755");
		const chmodFile = source.indexOf("chmod 644");
		const restart = source.indexOf("up -d --force-recreate wordpress cron");
		const smoke = source.indexOf("Running production smoke test");

		expect(extract).toBeGreaterThanOrEqual(0);
		expect(chown).toBeGreaterThan(extract);
		expect(chmodDir).toBeGreaterThan(chown);
		expect(chmodFile).toBeGreaterThan(chmodDir);
		expect(restart).toBeGreaterThan(chmodFile);
		expect(smoke).toBeGreaterThan(restart);
	});
});
