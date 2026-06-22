import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordField } from "./password-field";

describe("PasswordField", () => {
	it("toggles visibility", () => {
		render(
			<PasswordField
				autoComplete="new-password"
				id="p"
				label="Password"
				onChange={() => {
					// no-op
				}}
				value="secret123"
			/>
		);
		const input = screen.getByLabelText("Password") as HTMLInputElement;
		expect(input.type).toBe("password");
		fireEvent.click(screen.getByRole("button", { name: /show password/i }));
		expect(input.type).toBe("text");
	});
	it("shows a strength meter when enabled and non-empty", () => {
		render(
			<PasswordField
				autoComplete="new-password"
				id="p"
				label="Password"
				onChange={() => {
					// no-op
				}}
				showStrength
				value="Tr0ub4dour&long"
			/>
		);
		expect(screen.getByText(/strong|good|fair|weak/i)).toBeInTheDocument();
	});
	it("calls onChange", () => {
		const onChange = vi.fn();
		render(
			<PasswordField
				autoComplete="new-password"
				id="p"
				label="Password"
				onChange={onChange}
				value=""
			/>
		);
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "x" },
		});
		expect(onChange).toHaveBeenCalledWith("x");
	});
});
