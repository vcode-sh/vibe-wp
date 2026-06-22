/**
 * Per-row controls for the user manager, split into the editable role control and
 * the destructive/secondary actions menu. The current user's own row is locked
 * (role badge "(you)", no actions) — since only admins can act and the actor is
 * always an admin, the last admin can never be removed (never zero admins).
 */
import { useMutation } from "@tanstack/react-query";
import { Ban, KeyRound, LogOut, MoreHorizontal, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { type PanelRole, roleLabel, roleVariant } from "@/lib/roles";
import type { PanelUser } from "@/lib/users/derive";
import { BanUserDialog } from "./ban-user-dialog";
import { DeleteUserDialog } from "./delete-user-dialog";
import { RoleSelect } from "./role-select";
import { SetPasswordDialog } from "./set-password-dialog";

export function UserRoleControl({
	user,
	isSelf,
	onChanged,
}: {
	user: PanelUser;
	isSelf: boolean;
	onChanged: () => Promise<void>;
}) {
	const [pending, setPending] = useState<PanelRole | null>(null);

	const setRole = useMutation({
		mutationFn: async (role: PanelRole) => {
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
		onSettled: () => setPending(null),
	});

	if (isSelf) {
		return (
			<Badge variant={roleVariant(user.role)}>
				{roleLabel(user.role)} (you)
			</Badge>
		);
	}

	return (
		<RoleSelect
			disabled={setRole.isPending}
			id={`role-${user.id}`}
			onValueChange={(role) => {
				setPending(role);
				setRole.mutate(role);
			}}
			value={pending ?? (user.role as PanelRole)}
		/>
	);
}

export function UserRowActions({
	user,
	isSelf,
	onChanged,
}: {
	user: PanelUser;
	isSelf: boolean;
	onChanged: () => Promise<void>;
}) {
	const [pwOpen, setPwOpen] = useState(false);
	const [banOpen, setBanOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const unban = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.unbanUser({ userId: user.id });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to unban user.");
			}
		},
		onSuccess: async () => {
			await onChanged();
			toast.success(`${user.email} has been unbanned.`);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const revoke = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.revokeUserSessions({ userId: user.id });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to revoke sessions.");
			}
		},
		onSuccess: () => toast.success(`Signed out all sessions for ${user.email}.`),
		onError: (err: Error) => toast.error(err.message),
	});

	if (isSelf) {
		return <span className="text-muted-foreground text-xs">—</span>;
	}

	const busy = unban.isPending || revoke.isPending;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							aria-label={`Actions for ${user.email}`}
							disabled={busy}
							size="icon"
							variant="ghost"
						/>
					}
				>
					<MoreHorizontal className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => setPwOpen(true)}>
						<KeyRound className="size-4" />
						Reset password
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => revoke.mutate()}>
						<LogOut className="size-4" />
						Revoke sessions
					</DropdownMenuItem>
					{user.banned ? (
						<DropdownMenuItem onClick={() => unban.mutate()}>
							<ShieldOff className="size-4" />
							Unban user
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem onClick={() => setBanOpen(true)}>
							<Ban className="size-4 text-warning" />
							Ban user
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setDeleteOpen(true)}
						variant="destructive"
					>
						<Trash2 className="size-4" />
						Delete user
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<SetPasswordDialog
				onChanged={onChanged}
				onOpenChange={setPwOpen}
				open={pwOpen}
				user={user}
			/>
			<BanUserDialog
				onChanged={onChanged}
				onOpenChange={setBanOpen}
				open={banOpen}
				user={user}
			/>
			<DeleteUserDialog
				onChanged={onChanged}
				onOpenChange={setDeleteOpen}
				open={deleteOpen}
				user={user}
			/>
		</>
	);
}
