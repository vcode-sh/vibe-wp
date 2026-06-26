import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAutoScroll } from "@/lib/live/use-auto-scroll";
import { useLiveStream } from "@/lib/live/use-live-stream";
import { client } from "@/lib/orpc/client";

type LogService =
	| "nginx"
	| "php"
	| "wp"
	| "mariadb"
	| "redis"
	| "access"
	| "all";

interface LiveLogTailProps {
	active: boolean;
	filter?: string;
	service?: LogService;
	siteId: string;
}

/**
 * Outer wrapper owns a retry key so "Reconnect" can fully remount the inner
 * component — useLiveStream has no restart handle, so a fresh subscription means
 * a fresh mount.
 */
export function LiveLogTail(props: LiveLogTailProps) {
	const [retryKey, setRetryKey] = useState(0);
	return (
		<LiveLogTailInner
			{...props}
			key={retryKey}
			onRetry={() => setRetryKey((k) => k + 1)}
		/>
	);
}

function LiveLogTailInner({
	siteId,
	active,
	service = "all",
	filter,
	onRetry,
}: LiveLogTailProps & { onRetry: () => void }) {
	const live = useLiveStream(
		(signal) =>
			client.logsFollow(
				{ siteId, service, ...(filter ? { filter } : {}) },
				{ signal }
			),
		active
	);
	const text = live.lines.slice(-500).join("\n");

	// Auto-scroll as lines arrive; pauses if the user scrolls up.
	const logRef = useAutoScroll<HTMLDivElement>(live.lines.length);

	// The stream gave up (the job is gone or repeatedly dropped) — say so and
	// offer a real way forward instead of an endless "Waiting for log lines…".
	if (live.unrecoverable) {
		return (
			<div className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-border bg-background p-3 text-muted-foreground text-xs">
				<p>Live tail disconnected.</p>
				<Button onClick={onRetry} size="sm" variant="outline">
					Reconnect
				</Button>
			</div>
		);
	}

	return (
		// Plain div so the ref attaches directly to the scrollable element.
		<div
			className="h-64 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs"
			ref={logRef}
		>
			{renderBody(text, live.reconnecting)}
		</div>
	);
}

function renderBody(text: string, reconnecting: boolean) {
	if (text.length === 0) {
		return <p>{reconnecting ? "Reconnecting…" : "Waiting for log lines…"}</p>;
	}
	return (
		<>
			{reconnecting ? (
				<p className="mb-2 text-amber-500">Reconnecting…</p>
			) : null}
			<pre className="whitespace-pre-wrap break-words">{text}</pre>
		</>
	);
}
