/**
 * Shared panel role definitions and a styled native role <select>. The three
 * roles mirror the better-auth access-control roles configured server-side in
 * packages/auth (viewer / operator / admin); the server enforces what each can
 * do, this is only the picker UI.
 */
export const ROLE_OPTIONS = [
	{ value: "viewer", label: "Viewer" },
	{ value: "operator", label: "Operator" },
	{ value: "admin", label: "Admin" },
] as const;

export type Role = (typeof ROLE_OPTIONS)[number]["value"];

export function RoleSelect({
	id,
	value,
	onValueChange,
	disabled,
}: {
	id: string;
	value: Role;
	onValueChange: (role: Role) => void;
	disabled?: boolean;
}) {
	return (
		<select
			className="flex h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disabled}
			id={id}
			onChange={(e) => onValueChange(e.target.value as Role)}
			value={value}
		>
			{ROLE_OPTIONS.map((r) => (
				<option key={r.value} value={r.value}>
					{r.label}
				</option>
			))}
		</select>
	);
}
