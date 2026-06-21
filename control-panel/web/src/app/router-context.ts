import type { QueryClient } from "@tanstack/react-query";

import type { orpc } from "@/lib/orpc/client";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}
