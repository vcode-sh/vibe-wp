/**
 * Active sessions for the signed-in user. Lists every session (current one
 * flagged), lets you revoke an individual device, or sign out everywhere else.
 * Uses self-service `authClient.listSessions` / `revokeSession` /
 * `revokeOtherSessions`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { describeSession } from "@/lib/sessions";

const SESSIONS_KEY = ["self", "sessions"] as const;

export function SessionsCard() {
	const qc = useQueryClient();
	const { data: session } = authClient.useSession();
	const currentToken = session?.session.token;

	const query = useQuery({
		queryKey: SESSIONS_KEY,
		queryFn: async () => {
			const res = await authClient.listSessions();
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to load sessions.");
			}
			return res.data;
		},
	});

	const invalidate = () => qc.invalidateQueries({ queryKey: SESSIONS_KEY });

	const revoke = useMutation({
		mutationFn: async (token: string) => {
			const res = await authClient.revokeSession({ token });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to revoke session.");
			}
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Session signed out.");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const revokeOthers = useMutation({
		mutationFn: async () => {
			const res = await authClient.revokeOtherSessions();
			if (res.error) {
				throw new Error(
					res.error.message ?? "Failed to sign out other devices."
				);
			}
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Signed out everywhere else.");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const sessions = query.data ?? [];
	const hasOthers = sessions.some((s) => s.token !== currentToken);

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<CardTitle className="text-sm">Active sessions</CardTitle>
				{hasOthers ? (
					<Button
						disabled={revokeOthers.isPending}
						onClick={() => revokeOthers.mutate()}
						size="sm"
						variant="outline"
					>
						<LogOut className="mr-1.5 size-3.5" />
						Sign out other devices
					</Button>
				) : null}
			</CardHeader>
			<CardContent>
				<QueryBoundary
					errorMessage="Couldn't load your sessions."
					hasData={query.data !== undefined}
					isError={query.isError}
					isLoading={query.isLoading}
					onRetry={() => query.refetch()}
					skeletonClassName="h-32 w-full"
				>
					<div className="grid gap-2">
						{sessions.map((s) => {
							const desc = describeSession(s);
							const isCurrent = s.token === currentToken;
							return (
								<div
									className="flex items-center justify-between gap-3 rounded-lg border p-3"
									key={s.id}
								>
									<div className="grid min-w-0 gap-0.5">
										<div className="flex items-center gap-2">
											<span className="truncate font-medium text-sm">
												{desc.device}
											</span>
											{isCurrent ? (
												<Badge className="shrink-0" variant="secondary">
													This device
												</Badge>
											) : null}
										</div>
										<span className="truncate text-muted-foreground text-xs">
											{desc.detail}
										</span>
									</div>
									{isCurrent ? null : (
										<Button
											disabled={revoke.isPending}
											onClick={() => revoke.mutate(s.token)}
											size="sm"
											variant="ghost"
										>
											Sign out
										</Button>
									)}
								</div>
							);
						})}
					</div>
				</QueryBoundary>
			</CardContent>
		</Card>
	);
}
