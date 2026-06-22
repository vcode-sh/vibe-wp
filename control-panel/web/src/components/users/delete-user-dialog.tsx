/**
 * DeleteUserDialog — irreversible hard-delete (type-to-confirm the email). Goes
 * through `authClient.admin.removeUser`. Banning is offered as the reversible
 * alternative in the copy.
 */
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function DeleteUserDialog({
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
	const [typed, setTyped] = useState("");

	const remove = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.removeUser({ userId: user.id });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to delete user.");
			}
		},
		onSuccess: async () => {
			onOpenChange(false);
			setTyped("");
			await onChanged();
			toast.success(`${user.email} permanently deleted.`);
		},
		onError: (err: Error) => {
			onOpenChange(false);
			toast.error(err.message);
		},
	});

	const confirmed = typed.trim() === user.email;

	return (
		<AlertDialog
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setTyped("");
				}
			}}
			open={open}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Permanently delete {user.email}?</AlertDialogTitle>
					<AlertDialogDescription>
						This is irreversible. The account, sessions, and all audit linkage
						will be destroyed. Consider banning instead if you may need the audit
						trail later.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="grid gap-1.5 px-1 pb-1">
					<Label htmlFor="delete-user-confirm">
						Type <strong>{user.email}</strong> to confirm
					</Label>
					<Input
						autoComplete="off"
						id="delete-user-confirm"
						onChange={(e) => setTyped(e.target.value)}
						placeholder={user.email}
						value={typed}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => onOpenChange(false)}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={!confirmed || remove.isPending}
						onClick={() => {
							setTyped("");
							remove.mutate();
						}}
					>
						{remove.isPending ? "Deleting…" : "Delete permanently"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
