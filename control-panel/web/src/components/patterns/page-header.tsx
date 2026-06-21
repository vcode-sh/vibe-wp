import type { ReactNode } from "react";

export function PageHeader({
	title,
	subtitle,
	actions,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{subtitle ? (
					<p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
