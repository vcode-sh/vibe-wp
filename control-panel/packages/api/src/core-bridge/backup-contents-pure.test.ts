import { describe, expect, it } from "vitest";

import type { BackupRecord } from "../contract";
import {
	isValidBackupId,
	isValidFileName,
	isValidItemName,
	isValidTableName,
	parseBackupContents,
	resolveBackupLocation,
} from "./backup-contents-pure";

describe("parseBackupContents — NDJSON-TAB parser", () => {
	it("parses file + table lines", () => {
		const stdout = [
			"file\tuploads/2026/06/x.jpg\t1024",
			"file\tplugins/akismet/akismet.php\t512",
			"table\twp_posts\t",
			"table\twp_options\t",
		].join("\n");
		const res = parseBackupContents(stdout);
		expect(res.files).toEqual([
			{ path: "uploads/2026/06/x.jpg", bytes: 1024 },
			{ path: "plugins/akismet/akismet.php", bytes: 512 },
		]);
		expect(res.tables).toEqual(["wp_posts", "wp_options"]);
		expect(res.truncated).toBe(false);
	});

	it("flags truncated via the meta sentinel line", () => {
		const stdout = ["file\tuploads/a.txt\t1", "meta\ttruncated\t1"].join("\n");
		const res = parseBackupContents(stdout);
		expect(res.truncated).toBe(true);
		expect(res.files).toHaveLength(1);
	});

	it("ignores blank lines, CRLF, and unknown kinds", () => {
		const stdout = [
			"",
			"file\tuploads/a.txt\t2\r",
			"   ",
			"bogus\tnope\t0",
			"table\twp_users\t",
			"",
		].join("\n");
		const res = parseBackupContents(stdout);
		expect(res.files).toEqual([{ path: "uploads/a.txt", bytes: 2 }]);
		expect(res.tables).toEqual(["wp_users"]);
	});

	it("defaults a non-numeric / negative size to 0 and skips empty paths/names", () => {
		const stdout = [
			"file\tuploads/a.txt\tNaN",
			"file\t\t10",
			"file\tuploads/b.txt\t-5",
			"table\t\t",
		].join("\n");
		const res = parseBackupContents(stdout);
		expect(res.files).toEqual([
			{ path: "uploads/a.txt", bytes: 0 },
			{ path: "uploads/b.txt", bytes: 0 },
		]);
		expect(res.tables).toEqual([]);
	});

	it("returns empty result for empty input", () => {
		expect(parseBackupContents("")).toEqual({
			files: [],
			tables: [],
			truncated: false,
		});
	});
});

describe("isValidBackupId — relative backups path shape", () => {
	it.each([
		"backups/prod/20260621T010203Z",
		"backups/prod/20260621T010203Z/",
		"backups/stage/2026-06-21_01-02-03",
		"backups/prod/20260621T010203Z-nightly",
	])("accepts %j", (id) => {
		expect(isValidBackupId(id)).toBe(true);
	});

	it.each([
		"",
		"/etc/passwd",
		"backups/../etc",
		"backups/prod/../../etc",
		"notbackups/prod/ts",
		"backups/prod",
		"backups//ts",
		"backups/prod/ts; rm -rf /",
		"backups/prod/ts$(whoami)",
	])("rejects %j", (id) => {
		expect(isValidBackupId(id)).toBe(false);
	});
});

describe("isValidTableName", () => {
	it.each([
		"wp_posts",
		"wp_options",
		"a",
		"A0_z",
		"x".repeat(64),
	])("accepts %j", (n) => {
		expect(isValidTableName(n)).toBe(true);
	});

	it.each([
		"",
		"wp-posts",
		"wp posts",
		"wp_posts;",
		"`drop`",
		"x".repeat(65),
		"wp.posts",
	])("rejects %j", (n) => {
		expect(isValidTableName(n)).toBe(false);
	});
});

describe("isValidFileName", () => {
	it.each([
		"uploads/2026/06/x.jpg",
		"plugins/akismet/akismet.php",
		"themes/twentytwentyfour/style.css",
		"index.php",
	])("accepts %j", (n) => {
		expect(isValidFileName(n)).toBe(true);
	});

	it.each([
		"",
		"/etc/passwd",
		"../escape",
		"uploads/../../etc/passwd",
		"-rf",
		"with space.txt",
		"a;b",
		"a$(b)",
		"a`b`",
		"a|b",
	])("rejects %j", (n) => {
		expect(isValidFileName(n)).toBe(false);
	});
});

describe("isValidItemName — dispatches by kind", () => {
	it("uses table rules for table kind", () => {
		expect(isValidItemName("table", "wp_posts")).toBe(true);
		expect(isValidItemName("table", "wp-posts")).toBe(false);
	});
	it("uses file rules for file kind", () => {
		expect(isValidItemName("file", "uploads/a.txt")).toBe(true);
		expect(isValidItemName("file", "../escape")).toBe(false);
	});
});

describe("resolveBackupLocation", () => {
	const rec = (
		id: string,
		location: BackupRecord["location"]
	): BackupRecord => ({ id, location, sizeMB: 1, verified: true, whenISO: "" });

	const listing: BackupRecord[] = [
		rec("backups/prod/20260621T010203Z", "both"),
		rec("backups/prod/20260620T010203Z", "local"),
		rec("backups/prod/20260619T010203Z", "offsite"),
	];

	it("returns the listed location for a matching id", () => {
		expect(
			resolveBackupLocation(listing, "backups/prod/20260621T010203Z")
		).toBe("both");
		expect(
			resolveBackupLocation(listing, "backups/prod/20260620T010203Z")
		).toBe("local");
		expect(
			resolveBackupLocation(listing, "backups/prod/20260619T010203Z")
		).toBe("offsite");
	});

	it("tolerates a trailing slash on either side", () => {
		expect(
			resolveBackupLocation(listing, "backups/prod/20260621T010203Z/")
		).toBe("both");
		const trailing = [rec("backups/prod/20260618T010203Z/", "offsite")];
		expect(
			resolveBackupLocation(trailing, "backups/prod/20260618T010203Z")
		).toBe("offsite");
	});

	it("returns null when the id is absent (e.g. pruned) or the list is empty", () => {
		expect(resolveBackupLocation(listing, "backups/prod/nope")).toBe(null);
		expect(resolveBackupLocation([], "backups/prod/20260621T010203Z")).toBe(
			null
		);
	});
});
