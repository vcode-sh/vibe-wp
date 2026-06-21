import { Toaster } from "@control-panel/ui/components/sonner";
import { HeadContent, Outlet } from "@tanstack/react-router";

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
				<Outlet />
				<Toaster />
			</ThemeProvider>
		</>
	);
}
