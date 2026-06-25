import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// completeSetup is invoked via a mutation; capture whether it was called so we
// can assert that a confirm-password mismatch blocks the submit before any
// network call happens. vi.hoisted lets these mock fns exist above the hoisted
// vi.mock factories that reference them.
const { completeSetupMutate, signInEmail } = vi.hoisted(() => ({
	completeSetupMutate: vi.fn(() => Promise.resolve({ ok: true })),
	signInEmail: vi.fn(() => Promise.resolve({ data: {}, error: null })),
}));

vi.mock("@/lib/orpc/client", () => ({
	orpc: {
		completeSetup: {
			mutationOptions: () => ({ mutationFn: completeSetupMutate }),
		},
		panelAccess: {
			queryOptions: () => ({
				queryKey: ["panelAccess"],
				queryFn: () => ({
					url: "https://panel.10-0-0-1.sslip.io",
					host: "panel.10-0-0-1.sslip.io",
					ip: "10.0.0.1",
					isMagicDns: true,
				}),
			}),
		},
	},
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { signIn: { email: signInEmail } },
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => (
		<a href={to}>{children}</a>
	),
	useNavigate: () => vi.fn(),
}));

import { SetupWizard } from "./setup-wizard";

const CREATE_OWNER_HEADING = /create your owner account/i;
const EMAIL_LABEL = /email address/i;
const NAME_LABEL = /your name/i;
const MISMATCH_RE = /passwords don't match/i;
const SUBMIT_RE = /create owner account/i;

function wrap(ui: ReactNode) {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("SetupWizard", () => {
	it("renders step 1: create your owner account", () => {
		render(wrap(<SetupWizard />));
		expect(
			screen.getByRole("heading", { name: CREATE_OWNER_HEADING })
		).toBeInTheDocument();
		expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument();
		expect(screen.getByLabelText("Password")).toBeInTheDocument();
		expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
	});

	it("blocks submit when the confirm password does not match", async () => {
		render(wrap(<SetupWizard />));

		fireEvent.change(screen.getByLabelText(NAME_LABEL), {
			target: { value: "Jane Owner" },
		});
		fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
			target: { value: "owner@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "Sup3rStr0ng!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "DifferentPass9!" },
		});

		// The confirm-mismatch hint appears live, before any submit.
		expect(screen.getByText(MISMATCH_RE)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: SUBMIT_RE }));

		// The mismatch must short-circuit before completeSetup is ever called.
		await waitFor(() => {
			expect(completeSetupMutate).not.toHaveBeenCalled();
		});
		expect(signInEmail).not.toHaveBeenCalled();
	});
});
