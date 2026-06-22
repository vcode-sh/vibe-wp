/**
 * AddUserDialog — admin creates a panel user (email, optional name, role, and a
 * temporary password shared out of band). Goes through `authClient.admin
 * .createUser`; the server authorizes the admin caller. Self-contained trigger +
 * dialog; the password is never shown back after creation.
 */
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/lib/password";
import { type PanelRole, ROLE_OPTIONS } from "@/lib/roles";
import { PasswordField } from "./password-field";
import { RoleSelect } from "./role-select";

export function AddUserDialog({ onChanged }: { onChanged: () => Promise<void> }) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState<PanelRole>("viewer");

	function reset() {
		setEmail("");
		setName("");
		setPassword("");
		setRole("viewer");
	}

	const create = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.createUser({
				email: email.trim(),
				name: name.trim() || email.trim(),
				password,
				role,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to add user.");
			}
		},
		onSuccess: async () => {
			await onChanged();
			toast.success(`Added ${email.trim()}.`);
			reset();
			setOpen(false);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const emailValid = z.email().safeParse(email.trim()).success;
	const passwordValid = passwordSchema.safeParse(password).success;
	const canSubmit = emailValid && passwordValid && !create.isPending;

	return (
		<>
			<Button onClick={() => setOpen(true)}>
				<UserPlus className="mr-1.5 size-3.5" />
				Add user
			</Button>

			<Dialog
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) {
						reset();
					}
				}}
				open={open}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add panel user</DialogTitle>
						<DialogDescription>
							They sign in with this email and temporary password. Ask them to
							change it after their first sign-in.
						</DialogDescription>
					</DialogHeader>

					<form
						className="grid gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							if (canSubmit) {
								create.mutate();
							}
						}}
					>
						<div className="grid gap-1.5">
							<Label htmlFor="add-user-email">Email</Label>
							<Input
								autoComplete="off"
								id="add-user-email"
								onChange={(e) => setEmail(e.target.value)}
								placeholder="person@example.com"
								type="email"
								value={email}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="add-user-name">Name (optional)</Label>
							<Input
								autoComplete="off"
								id="add-user-name"
								onChange={(e) => setName(e.target.value)}
								placeholder="Full name"
								value={name}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="add-user-role">Role</Label>
							<RoleSelect
								id="add-user-role"
								onValueChange={setRole}
								value={role}
							/>
							<p className="text-muted-foreground text-xs">
								{ROLE_OPTIONS.find((r) => r.value === role)?.blurb}
							</p>
						</div>
						<PasswordField
							autoComplete="new-password"
							id="add-user-password"
							label="Temporary password"
							onChange={setPassword}
							placeholder="At least 8 characters"
							showStrength
							value={password}
						/>

						<DialogFooter>
							<Button
								onClick={() => setOpen(false)}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button disabled={!canSubmit} type="submit">
								{create.isPending ? "Adding…" : "Create user"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
