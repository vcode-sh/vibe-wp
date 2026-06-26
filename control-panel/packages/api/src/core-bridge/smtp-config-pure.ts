export interface SmtpConfigRow {
	auth: string | null;
	fromAddress: string | null;
	fromName: string | null;
	host: string | null;
	mode: string | null;
	password: string | null;
	port: number | null;
	secure: string | null;
	siteId: string;
	username: string | null;
}

/** Site row overrides global field-by-field; nulls fall through to global. */
export function mergeSmtpConfig(
	global: SmtpConfigRow | null,
	site: SmtpConfigRow | null
): SmtpConfigRow {
	const base = global ?? site;
	if (!base) {
		throw new Error("mergeSmtpConfig requires at least one row");
	}
	const pick = <K extends keyof SmtpConfigRow>(k: K): SmtpConfigRow[K] =>
		(site?.[k] ?? global?.[k] ?? null) as SmtpConfigRow[K];
	return {
		siteId: site?.siteId ?? global?.siteId ?? "",
		mode: pick("mode"),
		host: pick("host"),
		port: pick("port"),
		secure: pick("secure"),
		auth: pick("auth"),
		username: pick("username"),
		password: pick("password"),
		fromAddress: pick("fromAddress"),
		fromName: pick("fromName"),
	};
}

/** Map to SMTP_* env. SMTP_PASSWORD is OMITTED when null so the env-file apply
 * preserves the existing secret (matches bin/smtp-config-apply's sentinel). */
export function toEnv(cfg: SmtpConfigRow): Record<string, string> {
	const env: Record<string, string> = {
		SMTP_MODE: cfg.mode ?? "off",
		SMTP_HOST: cfg.host ?? "",
		SMTP_PORT: String(cfg.port ?? 587),
		SMTP_SECURE: cfg.secure ?? "starttls",
		SMTP_AUTH: cfg.auth ?? "on",
		SMTP_USER: cfg.username ?? "",
		SMTP_FROM: cfg.fromAddress ?? "",
		SMTP_FROM_NAME: cfg.fromName ?? "",
	};
	if (cfg.password !== null && cfg.password !== "") {
		env.SMTP_PASSWORD = cfg.password;
	}
	return env;
}

export function maskSmtpRow(
	row: SmtpConfigRow | null
): Record<string, unknown> | null {
	if (!row) {
		return null;
	}
	const { password, ...rest } = row;
	return { ...rest, hasPassword: password !== null && password.trim() !== "" };
}
