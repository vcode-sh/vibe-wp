export function mergeLineStreams(
	streams: ReadableStream<Uint8Array>[],
	transform: (line: string) => string
): AsyncIterable<string> {
	const queue: string[] = [];
	let active = streams.length;
	let wake: (() => void) | null = null;
	const signal = () => {
		if (wake) {
			const w = wake;
			wake = null;
			w();
		}
	};

	async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
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
				if (active === 0) {
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
