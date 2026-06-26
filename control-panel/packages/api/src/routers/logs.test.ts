import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "file::memory:?cache=shared";
process.env.BETTER_AUTH_SECRET = "test-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3001";

vi.mock("../core-bridge/sites", () => ({
	findSite: vi.fn(async () => ({
		id: "site-1",
		slug: "site-1",
		domain: "site.test",
		installDir: "/srv/site-1",
		hasStaging: false,
	})),
}));
vi.mock("../core-bridge/exec", () => ({
	STREAM_TIMEOUT_MS: 30 * 60 * 1000,
	runVibe: vi.fn(async () => ({
		code: 0,
		stderr: "",
		stdout: [
			"nginx-1  | 2026-06-26T10:00:00Z first",
			"nginx-1  | 2026-06-26T10:00:01Z second",
		].join("\n"),
	})),
	streamVibe: vi.fn(),
}));

const adminContext = {
	session: { user: { id: "admin-1", role: "admin" } },
} as never;

describe("logsRouter", () => {
	it("uses the requested tail depth for admin log export", async () => {
		const { runVibe } = await import("../core-bridge/exec");
		const { logsRouter } = await import("./logs");

		const result = await logsRouter.logsExport["~orpc"].handler({
			context: adminContext,
			input: { siteId: "site-1", service: "nginx", tail: "500" },
		});

		expect(runVibe).toHaveBeenCalledWith("/srv/site-1", "prod", "logsExport", {
			args: ["nginx", "500"],
			timeoutMs: 30_000,
		});
		expect(result.filename).toBe("logs-site-1-nginx-500.txt");
		expect(result.lines).toHaveLength(2);
	});
});
