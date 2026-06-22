/**
 * Self-service change-password. Requires the current password (better-auth
 * enforces this server-side too) and offers to sign out other devices. Uses the
 * shared PasswordField so strength + show/hide match the rest of the panel.
 */
import { Checkbox } from "@control-panel/ui/components/checkbox";
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/users/password-field";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/lib/password";

export function ChangePasswordCard() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [revokeOthers, setRevokeOthers] = useState(true);

	function reset() {
		setCurrent("");
		setNext("");
		setConfirm("");
	}

	const change = useMutation({
		mutationFn: async () => {
			const res = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
				revokeOtherSessions: revokeOthers,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to change password.");
			}
		},
		onSuccess: () => {
			reset();
			toast.success("Password changed.");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const valid =
		current.length > 0 &&
		passwordSchema.safeParse(next).success &&
		confirm === next;

	return (
		<Card className="scroll-mt-20" id="change-password">
			<CardHeader>
				<CardTitle className="text-sm">Change password</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid && !change.isPending) {
							change.mutate();
						}
					}}
				>
					<PasswordField
						autoComplete="current-password"
						id="current-password"
						label="Current password"
						onChange={setCurrent}
						value={current}
					/>
					<PasswordField
						autoComplete="new-password"
						id="new-password"
						label="New password"
						onChange={setNext}
						placeholder="At least 8 characters"
						showStrength
						value={next}
					/>
					<PasswordField
						autoComplete="new-password"
						id="confirm-password"
						label="Confirm new password"
						onChange={setConfirm}
						value={confirm}
					/>
					{confirm && confirm !== next ? (
						<p className="text-destructive text-xs">Passwords do not match.</p>
					) : null}
					<Label className="items-start gap-2">
						<Checkbox
							checked={revokeOthers}
							onCheckedChange={(c) => setRevokeOthers(c === true)}
						/>
						<span className="text-sm">
							Sign out other devices after changing
						</span>
					</Label>
					<div>
						<Button disabled={!valid || change.isPending} type="submit">
							{change.isPending ? "Changing…" : "Change password"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
