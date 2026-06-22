import type { JobStatus, StreamEvent } from "../contract";

export class LineStream {
	private readonly buffer: string[] = [];
	private status: JobStatus = "running";
	private done = false;
	private readonly wakers: (() => void)[] = [];
	private readonly heartbeat: ReturnType<typeof setInterval>;

	constructor(heartbeatMs = 4000) {
		this.heartbeat = setInterval(() => this.wake(), heartbeatMs);
	}

	push(line: string): void {
		this.buffer.push(line);
		this.wake();
	}

	end(status: JobStatus): void {
		this.status = status;
		this.done = true;
		clearInterval(this.heartbeat);
		this.wake();
	}

	private wake(): void {
		for (const w of this.wakers.splice(0)) {
			w();
		}
	}

	private wait(): Promise<void> {
		return new Promise((resolve) => this.wakers.push(resolve));
	}

	async *subscribe(): AsyncIterable<StreamEvent> {
		let cursor = 0;
		for (;;) {
			while (cursor < this.buffer.length) {
				yield {
					line: this.buffer[cursor] ?? "",
					status: this.status,
					done: false,
				};
				cursor++;
			}
			if (this.done) {
				yield { line: "", status: this.status, done: true };
				return;
			}
			// Park first (registers the waker) so synchronous pushes are never lost,
			// then, if the wake brought no new lines, emit an idle heartbeat tick.
			await this.wait();
			if (cursor >= this.buffer.length && !this.done) {
				yield { line: "", status: this.status, done: false };
			}
		}
	}
}
