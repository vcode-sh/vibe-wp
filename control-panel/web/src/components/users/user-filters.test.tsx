import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserFilters } from "./user-filters";

describe("UserFilters", () => {
	it("emits query changes", () => {
		const onChange = vi.fn();
		render(
			<UserFilters
				onChange={onChange}
				value={{ query: "", role: "all", status: "all" }}
			/>
		);
		fireEvent.change(screen.getByLabelText("Search users"), {
			target: { value: "bob" },
		});
		expect(onChange).toHaveBeenCalledWith({
			query: "bob",
			role: "all",
			status: "all",
		});
	});

	it("emits role and status changes", () => {
		const onChange = vi.fn();
		render(
			<UserFilters
				onChange={onChange}
				value={{ query: "", role: "all", status: "all" }}
			/>
		);
		fireEvent.change(screen.getByLabelText("Filter by role"), {
			target: { value: "admin" },
		});
		expect(onChange).toHaveBeenCalledWith({
			query: "",
			role: "admin",
			status: "all",
		});
		fireEvent.change(screen.getByLabelText("Filter by status"), {
			target: { value: "banned" },
		});
		expect(onChange).toHaveBeenCalledWith({
			query: "",
			role: "all",
			status: "banned",
		});
	});
});
