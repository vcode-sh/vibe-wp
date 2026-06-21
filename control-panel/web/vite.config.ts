import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Split the shared vendor layer into stable, independently-cacheable chunks
 * instead of one ~640 kB entry blob. Route views are already split by the
 * router plugin's `autoCodeSplitting`; this only regroups the always-loaded
 * `node_modules` layer.
 *
 * Groups are explicit with priorities so rolldown force-claims shared modules
 * (notably React + the JSX runtime) into one chunk and removes them from the
 * others — a single dynamic-name group instead lets React scatter into whatever
 * consumer chunk references it first.
 *
 * Matching is by package *name* (the segment after the last `node_modules/`),
 * not substring: a naive `/react/` test would also capture `@base-ui/react` and
 * `better-auth/.../react`, collapsing unrelated libraries into the React chunk.
 */
function packageName(id: string): string {
	const marker = "node_modules/";
	const at = id.lastIndexOf(marker);
	if (at === -1) {
		return "";
	}
	const segments = id.slice(at + marker.length).split("/");
	const first = segments[0] ?? "";
	return first.startsWith("@") ? `${first}/${segments[1] ?? ""}` : first;
}

const startsWithAny =
	(...prefixes: string[]) =>
	(pkg: string) =>
		prefixes.some((prefix) => pkg.startsWith(prefix));

// Only the big, homogeneous libraries get pinned chunks. Each group here is
// either entirely first-paint (react, zod, the router/query runtime, auth,
// orpc) or entirely deferred (base-ui). We deliberately do NOT add a
// `node_modules` catch-all: a catch-all force-claims every dependency into one
// eager chunk, which would pull route-only libraries (the ⌘K command palette's
// cmdk + Radix stack, the forms runtime) into first paint. Leaving the long
// tail ungrouped lets rolldown keep those with the lazy route chunks that use
// them, and fold the small shared first-paint utilities (sonner, lucide,
// tailwind-merge, next-themes) into the entry where they already belong.
const vendorGroups = [
	{
		name: "react",
		priority: 100,
		test: (id: string) =>
			["react", "react-dom", "scheduler", "react-is"].includes(packageName(id)),
	},
	{
		name: "zod",
		priority: 90,
		test: (id: string) => packageName(id) === "zod",
	},
	{
		// Router + query runtime only — the forms runtime (@tanstack/form-core,
		// ~94 kB) is route-only, so it stays out and rides the lazy route chunk.
		name: "tanstack",
		priority: 80,
		test: (id: string) => {
			const pkg = packageName(id);
			return pkg.startsWith("@tanstack/") && !pkg.includes("form");
		},
	},
	{
		name: "auth",
		priority: 70,
		test: (id: string) => {
			const pkg = packageName(id);
			return (
				pkg === "better-auth" ||
				pkg === "better-call" ||
				startsWithAny("@better-auth", "@better-fetch")(pkg)
			);
		},
	},
	{
		name: "orpc",
		priority: 60,
		test: (id: string) => packageName(id).startsWith("@orpc/"),
	},
	{
		name: "base-ui",
		priority: 50,
		test: (id: string) =>
			startsWithAny("@base-ui/", "@floating-ui/")(packageName(id)),
	},
];

export default defineConfig({
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		rollupOptions: {
			output: {
				advancedChunks: {
					groups: vendorGroups,
				},
			},
		},
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
});
