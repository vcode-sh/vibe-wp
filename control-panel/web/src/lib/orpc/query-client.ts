import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * True when a request failed because the session is gone — the server throws
 * ORPCError("UNAUTHORIZED") from requireAuth and the oRPC client rehydrates it
 * with `code: "UNAUTHORIZED"`. Duck-typed on `code` (not instanceof) because the
 * error crosses a serialization boundary, mirroring isJobGoneError. This is
 * distinct from FORBIDDEN (logged in, wrong role) — only a missing session sends
 * the user back to the login screen.
 */
function isUnauthorizedError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	return (error as { code?: unknown }).code === "UNAUTHORIZED";
}

// One redirect even if several in-flight requests fail at once. A full-page
// assign clears all stale authenticated state; the expired cookie means the
// login guard won't bounce the user back into the app.
let redirecting = false;
function redirectToLogin(): void {
	if (redirecting || typeof window === "undefined") {
		return;
	}
	redirecting = true;
	toast.error("Your session expired. Please sign in again.");
	window.location.assign("/login");
}

function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (isUnauthorizedError(error)) {
					redirectToLogin();
					return;
				}
				// Transient/read errors: a recoverable failure the user can retry.
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
		// Mutations carry their own component-level error toasts; the only thing
		// the global handler owns is sending an expired session back to login
		// (otherwise a write mid-session would fail with an opaque error and no
		// way forward). Non-auth mutation errors fall through to their handlers.
		mutationCache: new MutationCache({
			onError: (error) => {
				if (isUnauthorizedError(error)) {
					redirectToLogin();
				}
			},
		}),
	});
}

export const queryClient = createQueryClient();
