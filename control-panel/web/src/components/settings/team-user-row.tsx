/**
 * TeamUserRow — one panel user: role select, ban/unban (reversible), and a
 * hard-delete (type-to-confirm, labeled irreversible). The current user's own
 * row is locked to prevent self-lockout.
 */

import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { Ban, ShieldOff, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { ROLE_OPTIONS, type Role, RoleSelect } from "./team-roles";

export interface TeamUser {
	banned: boolean;
	banReason: string | null;
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
	const [banOpen, setBanOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [banReason, setBanReason] = useState("");
	const [deleteTyped, setDeleteTyped] = useState("");
	const [pendingRole, setPendingRole] = useState<Role | null>(null);
	const deleteInputRef = useRef<HTMLInputElement>(null);

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
		onSettled: () => setPendingRole(null),
	});

	const ban = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.banUser({
				userId: user.id,
				...(banReason.trim() ? { banReason: banReason.trim() } : {}),
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to ban user.");
			}
		},
		onSuccess: async () => {
			setBanOpen(false);
			setBanReason("");
			await onChanged();
			toast.success(`${user.email} has been banned.`);
		},
		onError: (err: Error) => {
			setBanOpen(false);
			toast.error(err.message);
		},
	});

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

	const remove = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.removeUser({ userId: user.id });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to delete user.");
			}
		},
		onSuccess: async () => {
			setDeleteOpen(false);
			setDeleteTyped("");
			await onChanged();
			toast.success(`${user.email} permanently deleted.`);
		},
		onError: (err: Error) => {
			setDeleteOpen(false);
			toast.error(err.message);
		},
	});

	const anyPending =
		setRole.isPending || ban.isPending || unban.isPending || remove.isPending;
	const deleteConfirmed = deleteTyped.trim() === user.email;

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border p-3">
			<div className="grid min-w-0 gap-0.5">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{user.email}</span>
					{user.banned && (
						<Badge className="shrink-0 text-xs" variant="destructive">
							Banned
						</Badge>
					)}
				</div>
				{user.name ? (
					<span className="truncate text-muted-foreground text-xs">
						{user.name}
					</span>
				) : null}
				{user.banned && user.banReason ? (
					<span className="truncate text-muted-foreground text-xs">
						Reason: {user.banReason}
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
							disabled={anyPending}
							id={`role-${user.id}`}
							onValueChange={(role) => {
								setPendingRole(role);
								setRole.mutate(role);
							}}
							value={pendingRole ?? (user.role as Role)}
						/>
						{user.banned ? (
							<Button
								aria-label={`Unban ${user.email}`}
								disabled={anyPending}
								onClick={() => unban.mutate()}
								size="icon"
								title="Unban user"
								variant="ghost"
							>
								<ShieldOff className="size-4 text-muted-foreground" />
							</Button>
						) : (
							<Button
								aria-label={`Ban ${user.email}`}
								disabled={anyPending}
								onClick={() => setBanOpen(true)}
								size="icon"
								title="Ban user"
								variant="ghost"
							>
								<Ban className="size-4 text-amber-500" />
							</Button>
						)}
						<Button
							aria-label={`Permanently delete ${user.email}`}
							disabled={anyPending}
							onClick={() => setDeleteOpen(true)}
							size="icon"
							title="Delete permanently"
							variant="ghost"
						>
							<Trash2 className="size-4 text-destructive" />
						</Button>
					</>
				)}
			</div>

			{/* Ban dialog — reversible, optional reason */}
			<AlertDialog
				onOpenChange={(v) => {
					if (!v) {
						setBanOpen(false);
						setBanReason("");
					}
				}}
				open={banOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Ban {user.email}?</AlertDialogTitle>
						<AlertDialogDescription>
							The user will be signed out and blocked from signing in. Their
							account and audit history are preserved — you can unban them at
							any time.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="grid gap-1.5 px-1 pb-1">
						<Label htmlFor="ban-reason">Reason (optional)</Label>
						<Input
							id="ban-reason"
							onChange={(e) => setBanReason(e.target.value)}
							placeholder="e.g. Security review"
							value={banReason}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel
							onClick={() => {
								setBanOpen(false);
								setBanReason("");
							}}
						>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={ban.isPending}
							onClick={() => ban.mutate()}
						>
							{ban.isPending ? "Banning…" : "Ban user"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Delete dialog — irreversible, type-to-confirm */}
			<AlertDialog
				onOpenChange={(v) => {
					if (!v) {
						setDeleteOpen(false);
						setDeleteTyped("");
					}
				}}
				open={deleteOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Permanently delete {user.email}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This is irreversible. The account, sessions, and all audit linkage
							will be destroyed. Consider banning instead if you may need the
							audit trail later.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="grid gap-1.5 px-1 pb-1">
						<Label htmlFor="delete-confirm">
							Type <strong>{user.email}</strong> to confirm
						</Label>
						<Input
							autoComplete="off"
							id="delete-confirm"
							onChange={(e) => setDeleteTyped(e.target.value)}
							placeholder={user.email}
							ref={deleteInputRef}
							value={deleteTyped}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel
							onClick={() => {
								setDeleteOpen(false);
								setDeleteTyped("");
							}}
						>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={!deleteConfirmed || remove.isPending}
							onClick={() => {
								setDeleteTyped("");
								remove.mutate();
							}}
						>
							{remove.isPending ? "Deleting…" : "Delete permanently"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
