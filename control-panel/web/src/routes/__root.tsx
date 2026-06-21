import { Toaster } from "@control-panel/ui/components/sonner";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import type { RouterAppContext } from "@/app/router-context";
import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Vibe WP Control Panel" },
			{
				name: "description",
				content: "Web control panel for Vibe WP sites and operations.",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				disableTransitionOnChange
				storageKey="vibe-wp-control-theme"
			>
				<Outlet />
				<Toaster richColors />
			</ThemeProvider>
		</>
	);
}
