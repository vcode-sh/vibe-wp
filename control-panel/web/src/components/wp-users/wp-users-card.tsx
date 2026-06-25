/**
 * WpUsersCard — manage a site's WordPress users (Plesk WP-Toolkit parity).
 * Lists the site's WP users (login / name / email / roles) and lets an admin
 * reset any user's password behind a dialog. The new password is sent over the
 * typed oRPC client to the admin-only setWpUserPassword procedure, which pipes
 * it to the root-gated wp-user-set-password op on STDIN — never argv/ps/logs.
 */

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PasswordField } from "@/components/users/password-field";
import { type client, orpc } from "@/lib/orpc/client";
import { passwordSchema } from "@/lib/password";

type WpUser = Awaited<ReturnType<typeof client.siteUsers>>[number];

function ResetPasswordDialog({
	siteId,
	user,
	onClose,
}: {
	siteId: string;
	user: WpUser;
	onClose: () => void;
}) {
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");

	const reset = useMutation({
		...orpc.setWpUserPassword.mutationOptions(),
		onSuccess: () => {
			toast.success(`Password updated for ${user.login}.`);
			onClose();
		},
		onError: (err: Error) =>
			toast.error(err.message || "Failed to set the password."),
	});

	const valid = passwordSchema.safeParse(next).success && confirm === next;

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reset password</DialogTitle>
					<DialogDescription>
						Set a new WordPress password for{" "}
						<span className="font-medium text-foreground">{user.login}</span> (
						{user.email}). They'll need to sign in again with it.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid && !reset.isPending) {
							reset.mutate({ siteId, userId: user.id, password: next });
						}
					}}
				>
					<PasswordField
						autoComplete="new-password"
						id="wp-new-password"
						label="New password"
						onChange={setNext}
						placeholder="At least 8 characters"
						showStrength
						value={next}
					/>
					<PasswordField
						autoComplete="new-password"
						id="wp-confirm-password"
						label="Confirm password"
						onChange={setConfirm}
						placeholder="Re-type the new password"
						value={confirm}
					/>
					{confirm.length > 0 && confirm !== next ? (
						<p className="text-destructive text-xs">Passwords don't match.</p>
					) : null}
					<DialogFooter>
						<Button onClick={onClose} type="button" variant="outline">
							Cancel
						</Button>
						<Button disabled={!valid || reset.isPending} type="submit">
							{reset.isPending ? "Setting…" : "Set password"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function UsersTable({ siteId }: { siteId: string }) {
	const users = useQuery(orpc.siteUsers.queryOptions({ input: { siteId } }));
	const [resetUser, setResetUser] = useState<WpUser | null>(null);
	const rows: WpUser[] = users.data ?? [];

	return (
		<QueryBoundary
			errorMessage="Couldn't load the site's WordPress users."
			hasData={users.data !== undefined}
			isError={users.isError}
			isLoading={users.isLoading}
			onRetry={() => users.refetch()}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>User</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Roles</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((u) => (
						<TableRow key={u.id}>
							<TableCell>
								<div className="font-medium">{u.login}</div>
								{u.displayName && u.displayName !== u.login ? (
									<div className="text-muted-foreground text-xs">
										{u.displayName}
									</div>
								) : null}
							</TableCell>
							<TableCell className="text-muted-foreground">{u.email}</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1">
									{u.roles.map((r) => (
										<Badge key={r} variant="secondary">
											{r}
										</Badge>
									))}
								</div>
							</TableCell>
							<TableCell className="text-right">
								<Button
									onClick={() => setResetUser(u)}
									size="sm"
									variant="outline"
								>
									<KeyRound className="size-3.5" />
									Reset password
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{resetUser ? (
				<ResetPasswordDialog
					onClose={() => setResetUser(null)}
					siteId={siteId}
					user={resetUser}
				/>
			) : null}
		</QueryBoundary>
	);
}

export function WpUsersCard({ siteId }: { siteId: string }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<Users className="size-4" />
					WordPress users
				</CardTitle>
			</CardHeader>
			<CardContent>
				<UsersTable siteId={siteId} />
			</CardContent>
		</Card>
	);
}
