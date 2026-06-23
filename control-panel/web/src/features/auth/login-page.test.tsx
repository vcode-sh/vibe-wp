import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Must be hoisted before any imports that consume them
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: vi.fn(() => ({ isPending: false })),
		signIn: { email: vi.fn() },
		signUp: { email: vi.fn() },
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock("@/data/queries", () => ({
	needsSetupQuery: () => ({ queryKey: ["needsSetup"], queryFn: async () => ({}) }),
}));

import { LoginPage } from "./login-page";

function wrap(ui: ReactNode, client: QueryClient) {
	return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("LoginPage", () => {
	it("shows the owner-creation screen when setup is needed", async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		qc.setQueryData(["needsSetup"], { needsSetup: true });

		render(wrap(<LoginPage />, qc));

		expect(screen.getByText("Create owner account")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /sign in/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByText(/already have an account/i),
		).not.toBeInTheDocument();
	});

	it("shows sign-in without a create-account toggle when an admin exists", async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		qc.setQueryData(["needsSetup"], { needsSetup: false });

		render(wrap(<LoginPage />, qc));

		expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
		expect(
			screen.queryByText(/need an account/i),
		).not.toBeInTheDocument();
	});
});
