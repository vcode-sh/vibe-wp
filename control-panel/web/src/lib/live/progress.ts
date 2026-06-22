export interface RcloneProgress {
	eta: string;
	percent: number;
	total: string;
	transferred: string;
}

// Matches rclone --stats-one-line output, with or without the "Transferred:"
// label. Real lines look like:
//   "2026/06/22 09:36:28 NOTICE:  220 KiB / 8 MiB, 3%, 0 B/s, ETA 30s"
//   "Transferred:   5.4 MiB / 9.3 MiB, 58%, 1.2 MiB/s, ETA 40s"
const LINE =
	/([\d.]+\s*[KMGTP]?i?B)\s*\/\s*([\d.]+\s*[KMGTP]?i?B),\s*(\d+)%(?:,.*?ETA\s+(\S+))?/;

export function parseRcloneProgress(line: string): RcloneProgress | null {
	const m = LINE.exec(line);
	if (!m) {
		return null;
	}
	const eta = (m[4] ?? "").trim();
	return {
		transferred: (m[1] ?? "").replace(/\s+/g, " ").trim(),
		total: (m[2] ?? "").replace(/\s+/g, " ").trim(),
		percent: Number.parseInt(m[3] ?? "0", 10),
		eta: eta === "-" ? "" : eta,
	};
}
