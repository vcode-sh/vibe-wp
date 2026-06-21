import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootLayout } from "@/app/root-layout";
import type { RouterAppContext } from "@/app/router-context";

import "../index.css";

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootLayout,
	head: () => ({
		meta: [
			{
				title: "Vibe WP Control Panel",
			},
			{
				name: "description",
				content: "Local web control panel for Vibe WP sites and operations.",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});
