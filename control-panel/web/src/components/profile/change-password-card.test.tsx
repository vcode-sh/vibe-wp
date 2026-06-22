import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		changePassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
	},
}));

import { ChangePasswordCard } from "./change-password-card";

function wrap(ui: ReactNode) {
	return (
		<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
	);
}

describe("ChangePasswordCard", () => {
	it("keeps submit disabled until valid and matching", () => {
		render(wrap(<ChangePasswordCard />));
		const submit = screen.getByRole("button", { name: "Change password" });
		expect(submit).toBeDisabled();
		fireEvent.change(screen.getByLabelText("Current password"), {
			target: { value: "oldpass12" },
		});
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newpass12" },
		});
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "mismatch" },
		});
		expect(submit).toBeDisabled();
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "newpass12" },
		});
		expect(submit).not.toBeDisabled();
	});
});
