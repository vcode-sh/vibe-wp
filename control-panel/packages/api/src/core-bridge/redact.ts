// KEY=value or KEY: value style secrets (env-var names, WP salts, tokens…)
const SECRET_KEY =
	/\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|SALT|KEY|PASS|PWD|AUTH)[A-Z0-9_]*)(\s*[=:]\s*)('[^']*'|"[^"]*"|\S+)/gi;

// --flag-style secrets:  --<word>-key <val> / --<word>-secret <val> / --*-key=<val>
// e.g.  --s3-secret-access-key wJalrXUtnFEMI  or  --access-key-id=AKIA…
const FLAG_SECRET =
	/(--[\w-]*(?:key|secret|token|password|pass|auth)[\w-]*)(\s+|=)([^\s]+)/gi;

// HTTP Authorization header or standalone Bearer token — apply BEFORE SECRET_KEY so
// the full "Bearer <token>" is masked rather than only the first word of the header value.
const BEARER = /\b(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/g;

// AWS/R2-style access key IDs — long uppercase alphanumeric strings in obvious key contexts.
// Matches AKIA… (AWS IAM) and similar 20-40 char alphanum IDs preceded by a key-context keyword.
const AWS_KEY_ID =
	/\b((?:access[_-]?key(?:[_-]?id)?|key[_-]?id)\s*[=:\s]+)([A-Z0-9]{16,40})\b/gi;

// SMTP AUTH exchange — mask the inline credential token. `AUTH PLAIN <base64>`
// and `AUTH LOGIN <base64>` decode directly to username/password, and msmtp's
// --debug/-v output is explicitly NOT sanitized. (bin/smtp-test no longer uses
// --debug; this is defense-in-depth for any other captured transcript.)
const SMTP_AUTH =
	/\b(AUTH\s+(?:PLAIN|LOGIN|CRAM-MD5|SCRAM-[A-Z0-9-]+)\s+)\S+/gi;

export function redact(text: string): string {
	return text
		.replace(BEARER, "$1***")
		.replace(SMTP_AUTH, "$1***")
		.replace(FLAG_SECRET, (_match, flag, sep, _val) => `${flag}${sep}***`)
		.replace(SECRET_KEY, (_match, key, sep) => `${key}${sep}***`)
		.replace(AWS_KEY_ID, (_match, prefix) => `${prefix}***`);
}
