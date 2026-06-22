export interface RcloneProgress {
	eta: string;
	percent: number;
	total: string;
	transferred: string;
}

// Matches rclone --stats-one-line output.  We require EITHER:
//   (a) a leading "Transferred:" label, OR
//   (b) an rclone log timestamp prefix  YYYY/MM/DD HH:MM:SS [LEVEL:]
// AND the trailing rate+ETA field  ", <n>%,…<rate>/s".
// This avoids false-positive matches on incidental log lines that happen to
// contain a size-ratio + percent substring.
//
// Real lines look like:
//   "2026/06/22 09:36:28 NOTICE:  1.184 MiB / 8 MiB, 15%, 210.393 KiB/s, ETA 33s"
//   "Transferred:   5.400 MiB / 9.300 MiB, 58%, 1.234 MiB/s, ETA 40s"
const TIMESTAMP_PREFIX = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/;
const TRANSFERRED_PREFIX = /^Transferred:/i;

const STATS_BODY =
	/([\d.]+\s*[KMGTP]?i?B)\s*\/\s*([\d.]+\s*[KMGTP]?i?B),\s*(\d+)%,\s*[\d.]+\s*[KMGTP]?i?B\/s(?:.*?ETA\s+(\S+))?/;

export function parseRcloneProgress(line: string): RcloneProgress | null {
	const hasPrefix =
		TIMESTAMP_PREFIX.test(line) || TRANSFERRED_PREFIX.test(line);
	if (!hasPrefix) {
		return null;
	}
	const m = STATS_BODY.exec(line);
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
