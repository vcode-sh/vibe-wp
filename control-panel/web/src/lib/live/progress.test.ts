import { describe, expect, it } from "vitest";

import { parseRcloneProgress } from "./progress";

describe("parseRcloneProgress", () => {
	it("parses an rclone --stats-one-line transfer line", () => {
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
	it("returns null for a non-progress line", () => {
		expect(parseRcloneProgress("Dumping MariaDB...")).toBeNull();
		expect(parseRcloneProgress("")).toBeNull();
	});
});
