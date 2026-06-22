/**
 * The user manager table. Presentational: it receives an already
 * filtered/sorted/paginated `PanelUser[]` and renders rows; role edits and
 * actions live in `user-row-actions`. The current user's row is flagged so its
 * controls lock.
 */
import { Avatar, AvatarFallback } from "@control-panel/ui/components/avatar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { Badge } from "@/components/ui/badge";
import type { PanelUser } from "@/lib/users/derive";
import { UserRoleControl, UserRowActions } from "./user-row-actions";

function initial(user: PanelUser): string {
	const source = user.name || user.email || "?";
	return source.slice(0, 1).toUpperCase();
}

function created(ms: number): string {
	if (!ms) {
		return "—";
	}
	return new Date(ms).toLocaleDateString();
}

export function UsersTable({
	users,
	currentUserId,
	onChanged,
}: {
	users: PanelUser[];
	currentUserId: string;
	onChanged: () => Promise<void>;
}) {
	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>User</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Created</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{users.map((user) => {
						const isSelf = user.id === currentUserId;
						return (
							<TableRow key={user.id}>
								<TableCell>
									<div className="flex items-center gap-3">
										<Avatar className="size-8 rounded-md">
											<AvatarFallback className="rounded-md bg-primary font-bold text-primary-foreground text-xs">
												{initial(user)}
											</AvatarFallback>
										</Avatar>
										<div className="grid min-w-0 gap-0.5">
											<span className="truncate font-medium text-sm">
												{user.name || user.email}
											</span>
											{user.name ? (
												<span className="truncate text-muted-foreground text-xs">
													{user.email}
												</span>
											) : null}
										</div>
									</div>
								</TableCell>
								<TableCell>
									<UserRoleControl
										isSelf={isSelf}
										onChanged={onChanged}
										user={user}
									/>
								</TableCell>
								<TableCell>
									{user.banned ? (
										<Badge variant="destructive">Banned</Badge>
									) : (
										<Badge variant="outline">Active</Badge>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{created(user.createdAt)}
								</TableCell>
								<TableCell className="text-right">
									<UserRowActions
										isSelf={isSelf}
										onChanged={onChanged}
										user={user}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
