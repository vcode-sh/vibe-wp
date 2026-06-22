import { ScrollArea } from "@/components/ui/scroll-area";
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
	return (
		<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs">
			{text.length === 0 ? (
				<p>Waiting for log lines…</p>
			) : (
				<pre className="whitespace-pre-wrap break-words">{text}</pre>
			)}
		</ScrollArea>
	);
}
