/**
 * StatusLegend — a one-line plain-language key for the green / amber / red dots
 * used across the monitoring tiles, so an operator never has to guess what a
 * color means. Colors are semantic tokens only.
 */

function Dot({ className }: { className: string }) {
	return <span className={`inline-block size-2.5 rounded-full ${className}`} />;
}

export function StatusLegend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
			<span className="flex items-center gap-1.5">
				<Dot className="bg-success" />
				Healthy — nothing to do
			</span>
			<span className="flex items-center gap-1.5">
				<Dot className="bg-warning" />
				Needs a look — worth checking soon
			</span>
			<span className="flex items-center gap-1.5">
				<Dot className="bg-destructive" />
				Action needed — fix now
			</span>
		</div>
	);
}
