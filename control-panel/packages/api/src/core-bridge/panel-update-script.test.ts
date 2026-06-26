import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const PANEL = resolve(here, "../../../../../bin/panel");
const source = readFileSync(PANEL, "utf8");

function functionBody(name: string): string {
	const start = source.indexOf(`${name}() {`);
	expect(start).toBeGreaterThanOrEqual(0);
	const rest = source.slice(start);
	const end = rest.indexOf("\n}\n");
	expect(end).toBeGreaterThan(0);
	return rest.slice(0, end);
}

describe("bin/panel update safety contract", () => {
	it("installs unzip before bootstrapping Bun", () => {
		const body = functionBody("ensure_bun");

		expect(body).toContain("apt-get install -y unzip");
		expect(functionBody("install_panel")).toContain("ensure_bun || return 1");
		expect(functionBody("update_panel")).toContain("ensure_bun || return 1");
		expect(functionBody("reset_password_panel")).toContain(
			"ensure_bun || return 1"
		);
	});

	it("fails deploy_panel explicitly when build or db migration fails", () => {
		const body = functionBody("deploy_panel");

		expect(body).toContain(
			'( cd "$REPO_DIR/control-panel" && "$BUN" install && "$BUN" run build ) || return 1'
		);
		expect(body).toContain(
			'( cd "$PANEL_DIR/app" && DATABASE_URL="file:$PANEL_DIR/data/panel.db" "$BUN" run db:push ) || return 1'
		);
	});

	it("snapshots app and panel data before update deploy", () => {
		const body = functionBody("panel_update_snapshot");

		expect(body).toContain('cp -a "$PANEL_DIR/app" "$snapshot/app"');
		expect(body).toContain('cp -a "$PANEL_DIR/data" "$snapshot/data"');
		expect(body).toContain("chmod 0700");
	});

	it("stops the running panel before copying SQLite data", () => {
		const body = functionBody("panel_update_snapshot");
		const stopIndex = body.indexOf('systemctl stop "$UNIT.service"');
		const dataCopyIndex = body.indexOf('cp -a "$PANEL_DIR/data"');

		expect(stopIndex).toBeGreaterThanOrEqual(0);
		expect(dataCopyIndex).toBeGreaterThan(stopIndex);
	});

	it("restores the previous snapshot when deploy_panel fails", () => {
		const body = functionBody("update_panel");
		const snapshotIndex = body.indexOf("panel_update_snapshot");
		const deployIndex = body.indexOf("if deploy_panel", snapshotIndex);
		const restoreIndex = body.indexOf("panel_update_restore");

		expect(snapshotIndex).toBeGreaterThanOrEqual(0);
		expect(deployIndex).toBeGreaterThan(snapshotIndex);
		expect(restoreIndex).toBeGreaterThan(deployIndex);
	});
});
