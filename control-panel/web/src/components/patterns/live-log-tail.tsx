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
type LogFilterMode = "text" | "regex";
type LogSeverity = "all" | "error" | "warn" | "info" | "debug";
type LogCache =
	| "all"
	| "HIT"
	| "MISS"
	| "BYPASS"
	| "EXPIRED"
	| "STALE"
	| "UPDATING"
	| "REVALIDATED";

interface LiveLogTailProps {
	active: boolean;
	cache?: LogCache;
	filter?: string;
	filterMode?: LogFilterMode;
	service?: LogService;
	severity?: LogSeverity;
	siteId: string;
}

const LOG_VIEWPORT =
	"h-[min(68vh,44rem)] min-h-[24rem] overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs";

/**
 * Outer wrapper owns a retry key so "Reconnect" can fully remount the inner
 * component — useLiveStream has no restart handle, so a fresh subscription means
 * a fresh mount.
 */
export function LiveLogTail(props: LiveLogTailProps) {
	const [retryKey, setRetryKey] = useState(0);
	const streamKey = [
		retryKey,
		props.siteId,
		props.service ?? "all",
		props.filter ?? "",
		props.filterMode ?? "text",
		props.severity ?? "all",
		props.cache ?? "all",
	].join(":");
	return (
		<LiveLogTailInner
			{...props}
			key={streamKey}
			onRetry={() => setRetryKey((k) => k + 1)}
		/>
	);
}

function LiveLogTailInner({
	siteId,
	active,
	service = "all",
	cache = "all",
	filter,
	filterMode = "text",
	severity = "all",
	onRetry,
}: LiveLogTailProps & { onRetry: () => void }) {
	const live = useLiveStream(
		(signal) =>
			client.logsFollow(
				{
					siteId,
					service,
					cache,
					severity,
					filterMode,
					...(filter ? { filter } : {}),
				},
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
			<div
				className={`${LOG_VIEWPORT} flex flex-col items-center justify-center`}
			>
				<p>Live tail disconnected.</p>
				<Button onClick={onRetry} size="sm" variant="outline">
					Reconnect
				</Button>
			</div>
		);
	}

	return (
		// Plain div so the ref attaches directly to the scrollable element.
		<div className={LOG_VIEWPORT} ref={logRef}>
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
