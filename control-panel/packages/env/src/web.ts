import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type ViteRuntimeEnv = ImportMeta & {
	env: Record<string, boolean | string | undefined>;
};

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
	},
	runtimeEnv: (import.meta as ViteRuntimeEnv).env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
