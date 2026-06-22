/**
 * TeamUserRow — one panel user: email, role badge, role select, and a remove
 * action. The current admin's own row is locked: no role change, no remove, so
 * an admin can't demote or delete themselves and lock everyone out.
 */
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { ROLE_OPTIONS, type Role, RoleSelect } from "./team-roles";

export interface TeamUser {
	email: string;
	id: string;
	name: string;
	role: string;
}

function roleVariant(role: string) {
	if (role === "admin") {
		return "default" as const;
	}
	if (role === "operator") {
		return "secondary" as const;
	}
	return "outline" as const;
}

function roleLabel(role: string) {
	return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function TeamUserRow({
	user,
	isSelf,
	onChanged,
}: {
	user: TeamUser;
	isSelf: boolean;
	onChanged: () => Promise<void>;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [pendingRole, setPendingRole] = useState<Role | null>(null);

	const setRole = useMutation({
		mutationFn: async (role: Role) => {
			const res = await authClient.admin.setRole({ userId: user.id, role });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to change role.");
			}
		},
		onSuccess: async () => {
			await onChanged();
			toast.success(`Role updated for ${user.email}.`);
		},
		onError: (err: Error) => toast.error(err.message),
		// Clear the optimistic selection once settled: on success the refetched
		// query data already matches; on error it reverts to the true role.
		onSettled: () => setPendingRole(null),
	});

	const remove = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.removeUser({ userId: user.id });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to remove user.");
			}
		},
		onSuccess: async () => {
			await onChanged();
			toast.success(`Removed ${user.email}.`);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border p-3">
			<div className="grid min-w-0 gap-0.5">
				<span className="truncate font-medium text-sm">{user.email}</span>
				{user.name ? (
					<span className="truncate text-muted-foreground text-xs">
						{user.name}
					</span>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{isSelf ? (
					<Badge variant={roleVariant(user.role)}>
						{roleLabel(user.role)} (you)
					</Badge>
				) : (
					<>
						<RoleSelect
							disabled={setRole.isPending}
							id={`role-${user.id}`}
							onValueChange={(role) => {
								setPendingRole(role);
								setRole.mutate(role);
							}}
							value={pendingRole ?? (user.role as Role)}
						/>
						<Button
							aria-label={`Remove ${user.email}`}
							disabled={remove.isPending}
							onClick={() => setConfirmRemove(true)}
							size="icon"
							variant="ghost"
						>
							<Trash2 className="size-4 text-destructive" />
						</Button>
					</>
				)}
			</div>
			<AlertDialog onOpenChange={setConfirmRemove} open={confirmRemove}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove panel user?</AlertDialogTitle>
						<AlertDialogDescription>
							{user.email} will lose all access to the panel. This permanently
							deletes their account and cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							autoFocus
							onClick={() => {
								setConfirmRemove(false);
								remove.mutate();
							}}
						>
							Remove user
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
