/**
 * BanUserDialog — reversible ban. The user is signed out and blocked from signing
 * in; their account and audit history are preserved. Goes through
 * `authClient.admin.banUser` with an optional reason.
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

export function BanUserDialog({
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
	const [reason, setReason] = useState("");

	const ban = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.banUser({
				userId: user.id,
				...(reason.trim() ? { banReason: reason.trim() } : {}),
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to ban user.");
			}
		},
		onSuccess: async () => {
			onOpenChange(false);
			setReason("");
			await onChanged();
			toast.success(`${user.email} has been banned.`);
		},
		onError: (err: Error) => {
			onOpenChange(false);
			toast.error(err.message);
		},
	});

	return (
		<AlertDialog
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setReason("");
				}
			}}
			open={open}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Ban {user.email}?</AlertDialogTitle>
					<AlertDialogDescription>
						The user will be signed out and blocked from signing in. Their
						account and audit history are preserved — you can unban them at any
						time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="grid gap-1.5 px-1 pb-1">
					<Label htmlFor="ban-reason">Reason (optional)</Label>
					<Input
						id="ban-reason"
						onChange={(e) => setReason(e.target.value)}
						placeholder="e.g. Security review"
						value={reason}
					/>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => onOpenChange(false)}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction disabled={ban.isPending} onClick={() => ban.mutate()}>
						{ban.isPending ? "Banning…" : "Ban user"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
