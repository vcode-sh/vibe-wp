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

// Navigate renders a marker carrying its target so we can assert the redirect;
// Link renders a plain anchor so the sign-in fallback link is queryable.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: vi.fn(() => vi.fn()),
	Navigate: ({ to }: { to: string }) => (
		<div data-testid="navigate" data-to={to} />
	),
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@/data/queries", () => ({
	needsSetupQuery: () => ({
		queryKey: ["needsSetup"],
		queryFn: () => ({}),
	}),
}));

import { LoginPage } from "./login-page";

const SIGN_IN_RE = /sign in/i;
const CREATE_OWNER_RE = /create owner account/i;
const SETUP_LINK_RE = /set up your panel/i;

function wrap(ui: ReactNode, client: QueryClient) {
	return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("LoginPage", () => {
	it("redirects to /setup when the panel still needs its owner", () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		qc.setQueryData(["needsSetup"], { needsSetup: true });

		render(wrap(<LoginPage />, qc));

		const nav = screen.getByTestId("navigate");
		expect(nav).toHaveAttribute("data-to", "/setup");
		// No inline owner-creation form is shown on the login page anymore.
		expect(screen.queryByText(CREATE_OWNER_RE)).not.toBeInTheDocument();
	});

	it("shows sign-in (no Navigate) plus a /setup fallback link when an owner exists", () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		qc.setQueryData(["needsSetup"], { needsSetup: false });

		render(wrap(<LoginPage />, qc));

		expect(
			screen.getByRole("button", { name: SIGN_IN_RE })
		).toBeInTheDocument();
		expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
		const setupLink = screen.getByRole("link", { name: SETUP_LINK_RE });
		expect(setupLink).toHaveAttribute("href", "/setup");
	});
});
