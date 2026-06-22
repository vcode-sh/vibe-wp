/**
 * Search + role + status filters for the user manager. Controlled: emits a new
 * `UserFilter` on every change; the parent applies it via the pure `filterUsers`
 * helper.
 */
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ROLE_OPTIONS } from "@/lib/roles";
import type { UserFilter } from "@/lib/users/derive";

const SELECT_CLASS =
	"flex h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function UserFilters({
	value,
	onChange,
}: {
	value: UserFilter;
	onChange: (next: UserFilter) => void;
}) {
	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div className="relative flex-1">
				<Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
				<Input
					aria-label="Search users"
					className="pl-8"
					onChange={(e) => onChange({ ...value, query: e.target.value })}
					placeholder="Search by name or email"
					value={value.query}
				/>
			</div>
			<select
				aria-label="Filter by role"
				className={SELECT_CLASS}
				onChange={(e) =>
					onChange({ ...value, role: e.target.value as UserFilter["role"] })
				}
				value={value.role}
			>
				<option value="all">All roles</option>
				{ROLE_OPTIONS.map((r) => (
					<option key={r.value} value={r.value}>
						{r.label}
					</option>
				))}
			</select>
			<select
				aria-label="Filter by status"
				className={SELECT_CLASS}
				onChange={(e) =>
					onChange({
						...value,
						status: e.target.value as UserFilter["status"],
					})
				}
				value={value.status}
			>
				<option value="all">All statuses</option>
				<option value="active">Active</option>
				<option value="banned">Banned</option>
			</select>
		</div>
	);
}
