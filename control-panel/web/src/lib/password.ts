/**
 * Password policy + a lightweight strength heuristic. The min/max mirror the
 * better-auth server config (`packages/auth`: minPasswordLength 8 /
 * maxPasswordLength 128) so client validation matches what the server enforces.
 * The score is advisory UX only — it never blocks submission beyond the schema.
 */
import { z } from "zod";

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export const passwordSchema = z
	.string()
	.min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`)
	.max(MAX_PASSWORD, `At most ${MAX_PASSWORD} characters`);

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export function scorePassword(pw: string): {
	score: 0 | 1 | 2 | 3 | 4;
	label: string;
	percent: number;
} {
	if (!pw) {
		return { score: 0, label: LABELS[0], percent: 0 };
	}
	let points = 0;
	if (pw.length >= 8) {
		points += 1;
	}
	if (pw.length >= 12) {
		points += 1;
	}
	if (pw.length >= 16) {
		points += 1;
	}
	if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) {
		points += 1;
	}
	if (/\d/.test(pw)) {
		points += 1;
	}
	if (/[^A-Za-z0-9]/.test(pw)) {
		points += 1;
	}
	const score = Math.min(4, Math.max(0, points - 1)) as 0 | 1 | 2 | 3 | 4;
	return {
		score,
		label: LABELS[score],
		percent: Math.round((score / 4) * 100),
	};
}
