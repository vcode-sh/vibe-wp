/**
 * Styled native role <select>. Roles come from the shared `lib/roles` source so
 * the picker, badges, and server enforcement all agree.
 */
import { type PanelRole, ROLE_OPTIONS } from "@/lib/roles";

export function RoleSelect({
	id,
	value,
	onValueChange,
	disabled,
}: {
	id: string;
	value: PanelRole;
	onValueChange: (role: PanelRole) => void;
	disabled?: boolean;
}) {
	return (
		<select
			className="flex h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disabled}
			id={id}
			onChange={(e) => onValueChange(e.target.value as PanelRole)}
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
