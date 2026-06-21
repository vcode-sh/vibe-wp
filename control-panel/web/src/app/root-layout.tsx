import { Toaster } from "@control-panel/ui/components/sonner";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

export function RootLayout() {
	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				disableTransitionOnChange
				storageKey="vibe-wp-control-theme"
			>
				<div className="grid h-svh grid-rows-[auto_1fr]">
					<Header />
					<Outlet />
				</div>
				<Toaster richColors />
			</ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
		</>
	);
}
