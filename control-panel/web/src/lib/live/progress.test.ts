import { describe, expect, it } from "vitest";

import { parseRcloneProgress } from "./progress";

describe("parseRcloneProgress", () => {
	it("parses the real rclone NOTICE --stats-one-line format (no Transferred: label)", () => {
		const r = parseRcloneProgress(
			"2026/06/22 09:36:28 NOTICE:     1.184 MiB / 8 MiB, 15%, 210.393 KiB/s, ETA 33s"
		);
		expect(r).toEqual({
			percent: 15,
			transferred: "1.184 MiB",
			total: "8 MiB",
			eta: "33s",
		});
	});
	it("also parses the Transferred:-labelled format", () => {
		const r = parseRcloneProgress(
			"Transferred:   	 5.400 MiB / 9.300 MiB, 58%, 1.234 MiB/s, ETA 40s"
		);
		expect(r).toEqual({
			percent: 58,
			transferred: "5.400 MiB",
			total: "9.300 MiB",
			eta: "40s",
		});
	});
	it("treats an unknown ETA ('-') as empty", () => {
		const r = parseRcloneProgress("220 KiB / 8 MiB, 3%, 0 B/s, ETA -");
		expect(r?.eta).toBe("");
		expect(r?.percent).toBe(3);
	});
	it("returns null for a non-progress line", () => {
		expect(parseRcloneProgress("Dumping MariaDB...")).toBeNull();
		expect(parseRcloneProgress("")).toBeNull();
	});
});
