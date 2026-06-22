import { useAutoScroll } from "@/lib/live/use-auto-scroll";
import { useLiveStream } from "@/lib/live/use-live-stream";
import { client } from "@/lib/orpc/client";

export function LiveLogTail({
	siteId,
	active,
}: {
	siteId: string;
	active: boolean;
}) {
	const live = useLiveStream(() => client.logsFollow({ siteId }), active);
	const text = live.lines.slice(-500).join("\n");

	// Auto-scroll as lines arrive; pauses if the user scrolls up.
	const logRef = useAutoScroll<HTMLDivElement>(live.lines.length);

	return (
		// Plain div so the ref attaches directly to the scrollable element.
		<div
			className="h-64 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs"
			ref={logRef}
		>
			{text.length === 0 ? (
				<p>Waiting for log lines…</p>
			) : (
				<pre className="whitespace-pre-wrap break-words">{text}</pre>
			)}
		</div>
	);
}
