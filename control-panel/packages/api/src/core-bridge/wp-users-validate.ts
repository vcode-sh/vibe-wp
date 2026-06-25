/**
 * Pure validators for the WordPress user-management ops. Kept import-free (no
 * env/config/spawn) so they can be unit-tested directly without booting the
 * core-bridge env layer — mirrors the repo's other `*-pure` style modules.
 */

export const MAX_PASSWORD_LEN = 128; // matches the client passwordSchema + better-auth
const DEL = 0x7f;
const FIRST_PRINTABLE = 0x20;

// A password reaches `wp eval` via STDIN; a newline or NUL would be truncated by
// the shell before WordPress sees it (silent lockout), so reject control chars.
export function hasControlChar(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < FIRST_PRINTABLE || code === DEL) {
			return true;
		}
	}
	return false;
}

// We address users by their unambiguous numeric id (the user-list read already
// returns it). Resolving by login would let wp-cli treat a numeric/email-shaped
// login as an id/email and reset a different account — so the wrapper takes an id.
export function assertUserId(userId: number): void {
	if (!Number.isInteger(userId) || userId < 1) {
		throw new Error(`Invalid WordPress user id: ${userId}`);
	}
}

export function assertPassword(password: string): void {
	if (password.length === 0 || password.length > MAX_PASSWORD_LEN) {
		throw new Error(`Password must be 1–${MAX_PASSWORD_LEN} characters`);
	}
	if (hasControlChar(password)) {
		throw new Error("Password must not contain control characters");
	}
}
