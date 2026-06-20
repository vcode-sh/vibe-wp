import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const configDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(configDir, "../..");
const serverDir = resolve(projectRoot, "server");

dotenv.config({
	path: resolve(serverDir, ".env"),
});

function resolveDatabaseUrl(databaseUrl = "") {
	if (!databaseUrl.startsWith("file:") || databaseUrl.startsWith("file:/")) {
		return databaseUrl;
	}

	return `file:${resolve(serverDir, databaseUrl.slice("file:".length))}`;
}

export default defineConfig({
	schema: "./src/schema/auth.ts",
	out: "./src/migrations",
	dialect: "turso",
	dbCredentials: {
		url: resolveDatabaseUrl(process.env.DATABASE_URL),
	},
});
