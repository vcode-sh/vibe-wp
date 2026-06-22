export interface RcloneProgress {
	eta: string;
	percent: number;
	total: string;
	transferred: string;
}

const LINE =
	/Transferred:\s*([\d.]+\s*\w+)\s*\/\s*([\d.]+\s*\w+),\s*(\d+)%(?:.*?ETA\s*(\S+))?/;

export function parseRcloneProgress(line: string): RcloneProgress | null {
	const m = LINE.exec(line);
	if (!m) {
		return null;
	}
	return {
		transferred: (m[1] ?? "").replace(/\s+/g, " ").trim(),
		total: (m[2] ?? "").replace(/\s+/g, " ").trim(),
		percent: Number.parseInt(m[3] ?? "0", 10),
		eta: (m[4] ?? "").trim(),
	};
}
