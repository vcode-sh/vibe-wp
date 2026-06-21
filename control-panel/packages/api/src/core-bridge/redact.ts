const SECRET_KEY =
	/\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|SALT|KEY|PASS|PWD|AUTH)[A-Z0-9_]*)(\s*[=:]\s*)('[^']*'|"[^"]*"|\S+)/gi;

export function redact(text: string): string {
	return text.replace(SECRET_KEY, (_match, key, sep) => `${key}${sep}***`);
}
