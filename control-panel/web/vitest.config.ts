import react from "@vitejs/plugin-react";
import type { Plugin } from "vitest/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react() as unknown as Plugin],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
	},
	resolve: {
		alias: {
			"@": new URL("./src", import.meta.url).pathname,
		},
	},
});
