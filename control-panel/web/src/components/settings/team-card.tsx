/**
 * TeamCard — admin-only panel-user management. Lists panel users with their
 * role, lets an admin add a user (email + temporary password + role), change a
 * user's role, and remove a user. All user management goes through the
 * better-auth admin client (`authClient.admin.*`); the server enforces that the
 * caller is an admin. The current user's own row is locked to prevent self
 * lockout. Temporary passwords are never displayed back.
 */
import { Label } from "@control-panel/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { type Role, RoleSelect } from "./team-roles";
import { type TeamUser, TeamUserRow } from "./team-user-row";

const TEAM_USERS_KEY = ["admin", "listUsers"] as const;

function toTeamUser(u: {
	id: string;
	email: string;
	name?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
}): TeamUser {
	return {
		id: u.id,
		email: u.email,
		name: u.name ?? "",
		role: u.role ?? "viewer",
		banned: u.banned === true,
		banReason: u.banReason ?? null,
	};
}

export function TeamCard({ currentUserId }: { currentUserId: string }) {
	const qc = useQueryClient();

	const query = useQuery({
		queryKey: TEAM_USERS_KEY,
		queryFn: async () => {
			const res = await authClient.admin.listUsers({ query: { limit: 200 } });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to load users.");
			}
			return res.data.users.map(toTeamUser);
		},
	});

	const refetch = async () => {
		await qc.invalidateQueries({ queryKey: TEAM_USERS_KEY });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Panel users</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-xs">
					Add people who can sign in to this panel and set what they can do.
					Viewers read only, operators run site actions, admins manage
					everything including team members.
				</p>
				<AddUserForm onAdded={refetch} />
				<QueryBoundary
					errorMessage="Couldn't load panel users."
					hasData={query.data !== undefined}
					isError={query.isError}
					isLoading={query.isLoading}
					onRetry={() => query.refetch()}
					skeletonClassName="h-40 w-full"
				>
					<div className="grid gap-2">
						{query.data && query.data.length > 0 ? (
							query.data.map((user) => (
								<TeamUserRow
									isSelf={user.id === currentUserId}
									key={user.id}
									onChanged={refetch}
									user={user}
								/>
							))
						) : (
							<p className="text-muted-foreground text-sm">
								No panel users yet.
							</p>
						)}
					</div>
				</QueryBoundary>
			</CardContent>
		</Card>
	);
}

function AddUserForm({ onAdded }: { onAdded: () => Promise<void> }) {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState<Role>("viewer");

	const create = useMutation({
		mutationFn: async () => {
			const res = await authClient.admin.createUser({
				email: email.trim(),
				password,
				name: name.trim() || email.trim(),
				role,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to add user.");
			}
		},
		onSuccess: async () => {
			await onAdded();
			toast.success(`Added ${email.trim()}.`);
			setEmail("");
			setName("");
			setPassword("");
			setRole("viewer");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const canSubmit =
		email.trim().length > 0 && password.length >= 8 && !create.isPending;

	return (
		<form
			className="grid gap-3 rounded-lg border p-3"
			onSubmit={(e) => {
				e.preventDefault();
				if (canSubmit) {
					create.mutate();
				}
			}}
		>
			<div className="grid gap-1.5">
				<Label htmlFor="team-email">Email</Label>
				<Input
					autoComplete="off"
					id="team-email"
					onChange={(e) => setEmail(e.target.value)}
					placeholder="person@example.com"
					type="email"
					value={email}
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="team-name">Name (optional)</Label>
				<Input
					autoComplete="off"
					id="team-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="Full name"
					value={name}
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="team-password">Temporary password</Label>
				<Input
					autoComplete="new-password"
					id="team-password"
					onChange={(e) => setPassword(e.target.value)}
					placeholder="At least 8 characters"
					type="password"
					value={password}
				/>
				<p className="text-muted-foreground text-xs">
					Share this with the user out of band. Ask them to change it after
					their first sign-in.
				</p>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="team-role">Role</Label>
				<RoleSelect id="team-role" onValueChange={setRole} value={role} />
			</div>
			<div>
				<Button disabled={!canSubmit} type="submit">
					{create.isPending ? "Adding…" : "Add user"}
				</Button>
			</div>
		</form>
	);
}
