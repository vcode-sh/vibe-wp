import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The redaction in bin/support-bundle is the LOAD-BEARING secret defense: gzip
// bytes are never re-redacted at the exec boundary, so any secret that reaches a
// text member untouched would ship in the bundle. This test runs the real script
// against a fake site whose prod.env is stuffed with sentinel secrets, untars the
// archive, and asserts NONE of the sentinels appear in ANY member — while the
// non-secret keys ARE present.

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(here, "../../../../../bin/support-bundle");

// Sentinel secret values planted into the fake prod.env. None must survive.
const SECRETS = [
	"DBSECRET_AAAA1111",
	"REDISSECRET_BBBB2222",
	"SMTPSECRET_CCCC3333",
	"WPSALT_DDDD4444",
	"R2SECRET_EEEE5555",
	"AISECRET_FFFF6666",
];

let root: string;
let outGz: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "vibe-sb-redact-"));
	const site = join(root, "sites", "demo");
	const bin = join(site, "bin");
	const envDir = join(site, "env");
	for (const d of [bin, envDir]) {
		spawnSync("mkdir", ["-p", d]);
	}
	// A fake bin/vibe — present so discovery finds the site; logs-recent /
	// doctor-runtime against it exit non-zero (captured inline, never fatal).
	const vibe = join(bin, "vibe");
	writeFileSync(vibe, '#!/bin/sh\necho "fake vibe: $*" >&2\nexit 3\n', {
		mode: 0o755,
	});
	// prod.env: non-secret keys + sentinel secrets across DB/Redis/SMTP/salt/R2/AI.
	writeFileSync(
		join(envDir, "prod.env"),
		[
			"WP_HOME=https://demo.example.com",
			"COMPOSE_PROJECT_NAME=vibe-wp-demo-prod",
			"HTTP_PORT=127.0.0.1:18080",
			`WORDPRESS_DB_PASSWORD=${SECRETS[0]}`,
			`REDIS_PASSWORD=${SECRETS[1]}`,
			`SMTP_PASSWORD=${SECRETS[2]}`,
			`AUTH_KEY=${SECRETS[3]}`,
			`RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=${SECRETS[4]}`,
			`ANTHROPIC_API_KEY=sk-ant-${SECRETS[5]}`,
			"",
		].join("\n")
	);

	outGz = join(root, "bundle.tar.gz");
	const res = spawnSync("sh", [SCRIPT], {
		env: {
			...process.env,
			LC_ALL: "C",
			PANEL_HOST_DIR: resolve(here, "../../../../.."),
			PANEL_SITES_ROOTS: join(root, "sites"),
		},
		maxBuffer: 64 * 1024 * 1024,
	});
	expect(res.status).toBe(0);
	writeFileSync(outGz, res.stdout);
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function untar(): string {
	// Extract the gzip tar and concatenate every member's text for a leak scan.
	const tar = gunzipSync(spawnSync("cat", [outGz]).stdout);
	const dest = join(root, "extracted");
	spawnSync("mkdir", ["-p", dest]);
	const res = spawnSync("tar", ["-xf", "-", "-C", dest], {
		input: tar,
		maxBuffer: 64 * 1024 * 1024,
	});
	expect(res.status).toBe(0);
	// grep -r all extracted text (binary-safe -a) and return it for assertions.
	return spawnSync("grep", ["-rae", ".", dest], {
		maxBuffer: 64 * 1024 * 1024,
	}).stdout.toString();
}

describe("bin/support-bundle member redaction", () => {
	it("produces a valid gzip archive", () => {
		expect(() => gunzipSync(spawnSync("cat", [outGz]).stdout)).not.toThrow();
	});

	it("contains NONE of the planted secret values in any member", () => {
		const all = untar();
		for (const secret of SECRETS) {
			expect(all).not.toContain(secret);
		}
		expect(all).not.toContain("sk-ant-");
	});

	it("still includes the non-secret config (WP_HOME, project name, port)", () => {
		const all = untar();
		expect(all).toContain("WP_HOME=https://demo.example.com");
		expect(all).toContain("COMPOSE_PROJECT_NAME=vibe-wp-demo-prod");
		expect(all).toContain("HTTP_PORT=127.0.0.1:18080");
	});
});
