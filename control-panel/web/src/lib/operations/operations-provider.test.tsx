import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	backupContentsQuery,
	backupsQuery,
	operationsListQuery,
	siteOverviewQuery,
	sitesQuery,
} from "@/data/queries";
import { OperationsProvider, useOperations } from "./operations-provider";

vi.mock("@/lib/orpc/client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/orpc/client")>();
	return {
		...actual,
		client: {
			...actual.client,
			operationsEvents: (_input: unknown, opts?: { signal?: AbortSignal }) =>
				(async function* () {
					await new Promise<void>((resolve) =>
						opts?.signal?.addEventListener("abort", resolve, { once: true })
					);
				})(),
		},
	};
});

function Harness() {
	const { finish, start } = useOperations();
	return (
		<>
			<button
				onClick={() =>
					start({
						jobId: "job-backup",
						kind: "backup",
						siteId: "site-a",
						title: "Backup",
					})
				}
				type="button"
			>
				start
			</button>
			<button onClick={() => finish("job-backup", "succeeded")} type="button">
				finish
			</button>
		</>
	);
}

function StateHarness() {
	const { expandedId, finish, minimize, ops, start } = useOperations();
	return (
		<>
			<button
				onClick={() =>
					start({
						jobId: "job-backup",
						kind: "backup",
						siteId: "site-a",
						title: "Backup",
					})
				}
				type="button"
			>
				start
			</button>
			<button onClick={() => minimize()} type="button">
				minimize
			</button>
			<button onClick={() => finish("job-backup", "succeeded")} type="button">
				finish
			</button>
			<p data-testid="expanded">{expandedId ?? "none"}</p>
			<ul>
				{ops.map((op) => (
					<li key={op.jobId}>{op.title}</li>
				))}
			</ul>
		</>
	);
}

function renderWithOperations(ui: React.ReactNode) {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<OperationsProvider>{ui}</OperationsProvider>
		</QueryClientProvider>
	);
}

function matches(filter: unknown, queryKey: readonly unknown[]): boolean {
	if (
		typeof filter === "object" &&
		filter !== null &&
		"queryKey" in filter &&
		JSON.stringify(filter.queryKey) === JSON.stringify(queryKey)
	) {
		return true;
	}
	if (
		typeof filter === "object" &&
		filter !== null &&
		"predicate" in filter &&
		typeof filter.predicate === "function"
	) {
		return filter.predicate({ queryKey });
	}
	return false;
}

function invalidated(
	calls: unknown[][],
	queryKey: readonly unknown[]
): boolean {
	return calls.some((call) => matches(call[0], queryKey));
}

describe("OperationsProvider realtime invalidation", () => {
	beforeEach(() => {
		globalThis.localStorage?.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("invalidates operation reads on start and terminal job reads on finish", async () => {
		const queryClient = new QueryClient();
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");

		render(
			<QueryClientProvider client={queryClient}>
				<OperationsProvider>
					<Harness />
				</OperationsProvider>
			</QueryClientProvider>
		);

		fireEvent.click(screen.getByRole("button", { name: "start" }));

		await waitFor(() => {
			expect(
				invalidated(invalidate.mock.calls, operationsListQuery().queryKey)
			).toBe(true);
			expect(
				invalidated(invalidate.mock.calls, siteOverviewQuery("site-a").queryKey)
			).toBe(true);
		});

		fireEvent.click(screen.getByRole("button", { name: "finish" }));

		await waitFor(() => {
			expect(
				invalidated(invalidate.mock.calls, backupsQuery("site-a").queryKey)
			).toBe(true);
			expect(
				invalidated(
					invalidate.mock.calls,
					backupContentsQuery("site-a", "b1").queryKey
				)
			).toBe(true);
			expect(invalidated(invalidate.mock.calls, sitesQuery().queryKey)).toBe(
				true
			);
		});
	});

	it("keeps minimized running operations but auto-dismisses minimized finished operations", () => {
		vi.useFakeTimers();
		renderWithOperations(<StateHarness />);

		fireEvent.click(screen.getByRole("button", { name: "start" }));
		expect(screen.getByText("Backup")).toBeInTheDocument();
		expect(screen.getByTestId("expanded")).toHaveTextContent("job-backup");

		fireEvent.click(screen.getByRole("button", { name: "minimize" }));
		expect(screen.getByTestId("expanded")).toHaveTextContent("none");

		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(screen.getByText("Backup")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "finish" }));

		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(screen.queryByText("Backup")).not.toBeInTheDocument();
	});
});
