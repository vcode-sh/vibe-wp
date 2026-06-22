/**
 * UserManager — the admin-only Users page body. Fetches all panel users once
 * (counts are tiny) and filters/sorts/paginates client-side via the pure helpers
 * in `lib/users/derive`. All mutations live in the child components and funnel
 * through `authClient.admin.*`; this component owns the query + filter/page state
 * and invalidates the list after any change.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
	filterUsers,
	paginate,
	type PanelUser,
	sortUsers,
	type UserFilter,
} from "@/lib/users/derive";
import { AddUserDialog } from "./add-user-dialog";
import { UserFilters } from "./user-filters";
import { UsersTable } from "./users-table";

const USERS_KEY = ["admin", "listUsers"] as const;
const PAGE_SIZE = 10;

function toPanelUser(u: {
	id: string;
	email: string;
	name?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	createdAt?: Date | string | number | null;
}): PanelUser {
	return {
		id: u.id,
		email: u.email,
		name: u.name ?? "",
		role: u.role ?? "viewer",
		banned: u.banned === true,
		banReason: u.banReason ?? null,
		createdAt: u.createdAt ? new Date(u.createdAt).getTime() : 0,
	};
}

export function UserManager() {
	const qc = useQueryClient();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id ?? "";
	const [filter, setFilter] = useState<UserFilter>({
		query: "",
		role: "all",
		status: "all",
	});
	const [page, setPage] = useState(0);

	const query = useQuery({
		queryKey: USERS_KEY,
		queryFn: async () => {
			const res = await authClient.admin.listUsers({ query: { limit: 200 } });
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to load users.");
			}
			return res.data.users.map(toPanelUser);
		},
	});

	const onChanged = async () => {
		await qc.invalidateQueries({ queryKey: USERS_KEY });
	};

	const all = query.data ?? [];
	const filtered = sortUsers(filterUsers(all, filter));
	const { slice, page: safePage, pageCount } = paginate(filtered, page, PAGE_SIZE);

	return (
		<>
			<TopBar crumbs={["Users"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={<AddUserDialog onChanged={onChanged} />}
					subtitle="Manage who can sign in to this panel and what they can do."
					title="Users"
				/>

				<UserFilters
					onChange={(next) => {
						setFilter(next);
						setPage(0);
					}}
					value={filter}
				/>

				<QueryBoundary
					errorMessage="Couldn't load panel users."
					hasData={query.data !== undefined}
					isError={query.isError}
					isLoading={query.isLoading}
					onRetry={() => query.refetch()}
					skeletonClassName="h-64 w-full"
				>
					{all.length === 0 ? (
						<p className="rounded-lg border p-6 text-muted-foreground text-sm">
							No panel users yet.
						</p>
					) : filtered.length === 0 ? (
						<p className="rounded-lg border p-6 text-muted-foreground text-sm">
							No users match your filters.
						</p>
					) : (
						<div className="grid gap-3">
							<UsersTable
								currentUserId={currentUserId}
								onChanged={onChanged}
								users={slice}
							/>
							{pageCount > 1 ? (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-sm">
										Page {safePage + 1} of {pageCount} · {filtered.length} users
									</span>
									<div className="flex gap-2">
										<Button
											disabled={safePage === 0}
											onClick={() => setPage(safePage - 1)}
											size="sm"
											variant="outline"
										>
											Previous
										</Button>
										<Button
											disabled={safePage >= pageCount - 1}
											onClick={() => setPage(safePage + 1)}
											size="sm"
											variant="outline"
										>
											Next
										</Button>
									</div>
								</div>
							) : null}
						</div>
					)}
				</QueryBoundary>
			</div>
		</>
	);
}
