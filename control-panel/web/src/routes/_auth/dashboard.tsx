import { createFileRoute } from "@tanstack/react-router";

import { OperationsPage } from "@/features/operations/operations-page";

export const Route = createFileRoute("/_auth/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const { session } = Route.useRouteContext();

	return <OperationsPage userName={session.data?.user.name} />;
}
