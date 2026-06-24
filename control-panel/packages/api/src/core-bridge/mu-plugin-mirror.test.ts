import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// core-bridge → src → api → packages → control-panel → vibe-wp (repo root)
const repoRoot = resolve(here, "../../../../../");
const md5 = (p: string) =>
	createHash("md5").update(readFileSync(resolve(repoRoot, p))).digest("hex");

describe("mu-plugin mirror invariant", () => {
	it("vibe-wp-insights.php is byte-identical in both locations", () => {
		expect(md5("content/mu-plugins/vibe-wp-insights.php")).toBe(
			md5("docker/wordpress/mu-plugins/vibe-wp-insights.php"),
		);
	});
});
