import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PANEL_SCRIPT_PATH = resolve(TEST_DIR, "../../../../../bin/panel");

describe("bin/panel systemd service", () => {
	it("starts the panel server with the low-memory Bun runtime", () => {
		const source = readFileSync(PANEL_SCRIPT_PATH, "utf8");

		expect(source).toContain("ExecStart=$BUN --smol run src/index.ts");
	});
});
