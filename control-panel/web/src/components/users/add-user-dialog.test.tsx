import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		admin: { createUser: vi.fn().mockResolvedValue({ data: {}, error: null }) },
	},
}));

import { AddUserDialog } from "./add-user-dialog";

function wrap(ui: ReactNode) {
	return (
		<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
	);
}

describe("AddUserDialog", () => {
	it("keeps submit disabled until email + password are valid", () => {
		render(
			wrap(
				<AddUserDialog
					onChanged={async () => {
						// no-op
					}}
				/>
			)
		);
		fireEvent.click(screen.getByRole("button", { name: /add user/i }));
		const submit = screen.getByRole("button", { name: /create user/i });
		expect(submit).toBeDisabled();
		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "x@y.com" },
		});
		fireEvent.change(screen.getByLabelText(/temporary password/i), {
			target: { value: "longenough" },
		});
		expect(submit).not.toBeDisabled();
	});
});
