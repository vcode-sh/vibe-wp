/**
 * Web env access, hand-validated to keep zod out of the first-paint bundle.
 *
 * This module sits on the boot critical path: it is imported by the oRPC and
 * auth clients, which the router imports at startup. The previous
 * `createEnv` + `z.url()` schema therefore pulled the entire zod library
 * (~268 kB raw / ~61 kB gzip) into the entry chunk just to validate one URL.
 *
 * A native `URL` check does the same job at zero bundle cost. zod still ships
 * with the routes that genuinely use it at runtime (login forms, the add-user
 * dialog, password-strength) — it is just no longer loaded on first paint.
 *
 * The server env (`./server`) keeps its zod schema: it runs under Node, where
 * bundle size is irrelevant and zod's richer validation is worth keeping.
 */

type ViteRuntimeEnv = ImportMeta & {
	env: Record<string, boolean | string | undefined>;
};

const runtimeEnv = (import.meta as ViteRuntimeEnv).env;
const skipValidation = Boolean(runtimeEnv.SKIP_ENV_VALIDATION);

function requireUrl(name: string, value: boolean | string | undefined): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`❌ Invalid environment variables: ${name} is required`);
	}
	if (!(skipValidation || URL.canParse(value))) {
		throw new Error(
			`❌ Invalid environment variables: ${name} must be a valid URL`
		);
	}
	return value;
}

export const env = {
	VITE_SERVER_URL: requireUrl("VITE_SERVER_URL", runtimeEnv.VITE_SERVER_URL),
} as const;
