/**
 * SetPasswordDialog — admin sets a new password for another user (e.g. after a
 * lockout) via `authClient.admin.setUserPassword`, with an option to also revoke
 * that user's sessions so any current logins are forced to re-authenticate. The
 * host-side `bin/panel reset-password` CLI remains the out-of-band recovery path.
 */
import { Checkbox } from "@control-panel/ui/components/checkbox";
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/lib/password";
import { PasswordField } from "./password-field";

export function SetPasswordDialog({
	user,
	open,
	onOpenChange,
	onChanged,
}: {
	user: { id: string; email: string };
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChanged: () => Promise<void>;
}) {
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [revoke, setRevoke] = useState(true);

	function reset() {
		setPassword("");
		setConfirm("");
		setRevoke(true);
	}

	const submit = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.setUserPassword({
				newPassword: password,
				userId: user.id,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to set password.");
			}
			if (revoke) {
				const revoked = await authClient.admin.revokeUserSessions({
					userId: user.id,
				});
				if (revoked.error) {
					throw new Error(
						revoked.error.message ?? "Password set, but revoking sessions failed."
					);
				}
			}
		},
		onSuccess: async () => {
			await onChanged();
			toast.success(`Password set for ${user.email}.`);
			reset();
			onOpenChange(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const valid =
		passwordSchema.safeParse(password).success && confirm === password;

	return (
		<Dialog
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					reset();
				}
			}}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Set a new password</DialogTitle>
					<DialogDescription>
						Set a temporary password for{" "}
						<span className="font-medium text-foreground">{user.email}</span> and
						share it out of band. They should change it after signing in.
					</DialogDescription>
				</DialogHeader>

				<form
					className="grid gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid && !submit.isPending) {
							submit.mutate();
						}
					}}
				>
					<PasswordField
						autoComplete="new-password"
						id="set-password-new"
						label="New password"
						onChange={setPassword}
						placeholder="At least 8 characters"
						showStrength
						value={password}
					/>
					<PasswordField
						autoComplete="new-password"
						id="set-password-confirm"
						label="Confirm password"
						onChange={setConfirm}
						value={confirm}
					/>
					{confirm && confirm !== password ? (
						<p className="text-destructive text-xs">Passwords do not match.</p>
					) : null}
					<Label className="items-start gap-2 rounded-md border p-3">
						<Checkbox
							checked={revoke}
							onCheckedChange={(next) => setRevoke(next === true)}
						/>
						<span className="grid gap-0.5">
							<span className="font-medium">Sign out their active sessions</span>
							<span className="text-muted-foreground text-xs">
								Forces any current logins to sign in again with the new password.
							</span>
						</span>
					</Label>

					<DialogFooter>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={!valid || submit.isPending} type="submit">
							{submit.isPending ? "Saving…" : "Set password"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
