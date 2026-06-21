import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Loader } from "@/components/loader";
import { orpc } from "@/lib/orpc/client";
import { queryClient } from "@/lib/orpc/query-client";
import { routeTree } from "@/routeTree.gen";

export const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultPendingComponent: () => <Loader />,
	context: { orpc, queryClient },
	Wrap({ children }: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

export function AppRouterProvider() {
	return <RouterProvider router={router} />;
}
