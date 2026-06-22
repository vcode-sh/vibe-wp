import { Label } from "@control-panel/ui/components/label";
import type { ReactNode } from "react";
import { useId } from "react";

/** Labeled field wrapper with optional hint and inline error message. */
export function FieldRow({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: (id: string) => ReactNode;
}) {
	const id = useId();
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children(id)}
			{hint && !error ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</div>
	);
}
