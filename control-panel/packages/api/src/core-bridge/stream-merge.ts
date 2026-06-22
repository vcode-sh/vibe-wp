export function mergeLineStreams(
	streams: ReadableStream<Uint8Array>[],
	transform: (line: string) => string,
	stopSignal?: Promise<unknown>
): AsyncIterable<string> {
	const queue: string[] = [];
	let active = streams.length;
	let wake: (() => void) | null = null;
	let stopped = false;
	const readers: { cancel: () => Promise<void> }[] = [];
	const signal = () => {
		if (wake) {
			const w = wake;
			wake = null;
			w();
		}
	};

	// When the producer process has exited (plus a short grace), force the
	// readers closed so the merge terminates even if an orphaned grandchild is
	// still holding a pipe open (which would otherwise block EOF forever).
	if (stopSignal) {
		stopSignal.then(() => {
			stopped = true;
			for (const r of readers) {
				r.cancel().catch(() => undefined);
			}
			signal();
		});
	}

	async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
		readers.push(reader);
		const decoder = new TextDecoder();
		let buf = "";
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buf += decoder.decode(value, { stream: true });
				let nl = buf.indexOf("\n");
				while (nl !== -1) {
					queue.push(transform(buf.slice(0, nl)));
					buf = buf.slice(nl + 1);
					nl = buf.indexOf("\n");
				}
				signal();
			}
			if (buf.length > 0) {
				queue.push(transform(buf));
			}
		} catch {
			// reader cancelled (stop signal) — stop pumping this stream
		} finally {
			active -= 1;
			signal();
		}
	}

	const pumps = streams.map((s) => pump(s));

	return (async function* generate(): AsyncIterable<string> {
		try {
			for (;;) {
				while (queue.length > 0) {
					yield queue.shift() as string;
				}
				if (active === 0 || stopped) {
					return;
				}
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
		} finally {
			await Promise.allSettled(pumps);
		}
	})();
}
