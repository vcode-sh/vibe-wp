import { afterEach, describe, expect, it, vi } from "vitest";

import {
	runSupportBundle,
	SUPPORT_BUNDLE_MAX_BYTES,
	wrapPanelUpdateArgv,
	wrapSupportBundleArgv,
} from "./exec";

const RUNNER = "/opt/vibe-wp-panel/bin/vibe-panel-run";

const TOO_LARGE_RE = /too large/;
const EXITED_2_RE = /exited 2/;
const LEAKED_SECRET_RE = /leakme123/;

/** Save/restore PANEL_PRIVILEGED_RUNNER + PANEL_HOST_DIR around each case. */
function withEnv(
	vars: { runner?: string; hostDir?: string },
	fn: () => void
): void {
	const prevRunner = process.env.PANEL_PRIVILEGED_RUNNER;
	const prevHost = process.env.PANEL_HOST_DIR;
	if (vars.runner === undefined) {
		delete process.env.PANEL_PRIVILEGED_RUNNER;
	} else {
		process.env.PANEL_PRIVILEGED_RUNNER = vars.runner;
	}
	if (vars.hostDir === undefined) {
		delete process.env.PANEL_HOST_DIR;
	} else {
		process.env.PANEL_HOST_DIR = vars.hostDir;
	}
	try {
		fn();
	} finally {
		if (prevRunner === undefined) {
			delete process.env.PANEL_PRIVILEGED_RUNNER;
		} else {
			process.env.PANEL_PRIVILEGED_RUNNER = prevRunner;
		}
		if (prevHost === undefined) {
			delete process.env.PANEL_HOST_DIR;
		} else {
			process.env.PANEL_HOST_DIR = prevHost;
		}
	}
}

describe("wrapSupportBundleArgv", () => {
	it("sudo-wraps as [sudo, -n, runner, support-bundle] when a runner is set", () => {
		withEnv({ runner: RUNNER }, () => {
			expect(wrapSupportBundleArgv()).toEqual([
				"sudo",
				"-n",
				RUNNER,
				"support-bundle",
			]);
		});
	});

	it("spawns the repo script directly when no runner is set (dev path)", () => {
		withEnv({ runner: undefined, hostDir: "/opt/vibe-wp-src" }, () => {
			expect(wrapSupportBundleArgv()).toEqual([
				"/opt/vibe-wp-src/bin/support-bundle",
			]);
		});
	});

	it("never carries any free argument (zero-arg op)", () => {
		withEnv({ runner: RUNNER }, () => {
			// Exactly four tokens: sudo -n runner support-bundle. No site/path/flag.
			expect(wrapSupportBundleArgv()).toHaveLength(4);
		});
	});
});

describe("wrapPanelUpdateArgv", () => {
	it("sudo-wraps as [sudo, -n, runner, panel-update] when a runner is set", () => {
		withEnv({ runner: RUNNER }, () => {
			expect(wrapPanelUpdateArgv()).toEqual([
				"sudo",
				"-n",
				RUNNER,
				"panel-update",
			]);
		});
	});

	it("spawns bin/panel update directly when no runner is set (dev path)", () => {
		withEnv({ runner: undefined, hostDir: "/opt/vibe-wp-src" }, () => {
			expect(wrapPanelUpdateArgv()).toEqual([
				"/opt/vibe-wp-src/bin/panel",
				"update",
			]);
		});
	});

	it("is strictly `panel update` — never any other bin/panel subcommand", () => {
		withEnv({ runner: undefined, hostDir: "/opt/vibe-wp-src" }, () => {
			const argv = wrapPanelUpdateArgv();
			expect(argv.at(-1)).toBe("update");
			expect(argv).not.toContain("uninstall");
			expect(argv).not.toContain("reset-password");
			expect(argv).not.toContain("install");
		});
	});
});

describe("support-bundle base64 boundary contract", () => {
	it("round-trips arbitrary gzip-like bytes through base64 (no corruption)", () => {
		// The procedure returns Buffer.from(bytes).toString("base64"); the web
		// decodes via atob → Uint8Array. Prove a byte-for-byte round trip for bytes
		// that include the high range a gzip stream uses (0x1f 0x8b … 0xff).
		const original = new Uint8Array([
			0x1f, 0x8b, 0x08, 0x00, 0x00, 0xff, 0xfe, 0x7f, 0x80, 0x00,
		]);
		const b64 = Buffer.from(original).toString("base64");
		// Mirror the browser-side atob decode.
		const binary = atob(b64);
		const decoded = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			decoded[i] = binary.charCodeAt(i);
		}
		expect([...decoded]).toEqual([...original]);
	});

	it("exposes a defensive 25 MB size cap", () => {
		expect(SUPPORT_BUNDLE_MAX_BYTES).toBe(25 * 1024 * 1024);
	});
});

// ---------------------------------------------------------------------------
// runSupportBundle spawns via Bun.spawn, which is undefined under vitest's node
// environment. Stub a minimal Bun.spawn so we can exercise the size-cap +
// non-zero-exit branches without a real process. Restored after each case.
// ---------------------------------------------------------------------------

interface FakeChild {
	exited: Promise<number>;
	kill: () => void;
	stderr: ReadableStream<Uint8Array>;
	stdout: ReadableStream<Uint8Array>;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new Response(bytes).body as ReadableStream<Uint8Array>;
}

function stubBunSpawn(opts: {
	stdout: Uint8Array;
	stderr?: string;
	code?: number;
}): void {
	const fake = (): FakeChild => ({
		stdout: streamOf(opts.stdout),
		stderr: new Response(opts.stderr ?? "").body as ReadableStream<Uint8Array>,
		exited: Promise.resolve(opts.code ?? 0),
		kill: () => undefined,
	});
	vi.stubGlobal("Bun", { spawn: fake });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("runSupportBundle", () => {
	it("returns the archive bytes unchanged (no redact on the gzip stream)", async () => {
		// Use the runner path so wrapSupportBundleArgv resolves without a host dir.
		const archive = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x42, 0xff]);
		stubBunSpawn({ stdout: archive });
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			const bytes = await runSupportBundle();
			expect([...bytes]).toEqual([...archive]);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});

	it("rejects when the archive exceeds the size cap", async () => {
		const big = new Uint8Array(64);
		stubBunSpawn({ stdout: big });
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			await expect(runSupportBundle({ maxBytes: 16 })).rejects.toThrow(
				TOO_LARGE_RE
			);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});

	it("rejects (with redacted stderr) on a non-zero collector exit", async () => {
		stubBunSpawn({
			stdout: new Uint8Array(0),
			stderr: "boom DB_PASSWORD=leakme123",
			code: 2,
		});
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			const err = await runSupportBundle().catch((e: Error) => e);
			expect(err).toBeInstanceOf(Error);
			// Exit code surfaced; any secret in stderr is redacted before re-throwing.
			expect((err as Error).message).toMatch(EXITED_2_RE);
			expect((err as Error).message).not.toMatch(LEAKED_SECRET_RE);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});
});
