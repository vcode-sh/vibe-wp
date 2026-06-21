import type { JobStatus, StreamEvent } from "../contract";

export class LineStream {
	private readonly buffer: string[] = [];
	private status: JobStatus = "running";
	private done = false;
	private readonly wakers: (() => void)[] = [];

	push(line: string): void {
		this.buffer.push(line);
		this.wake();
	}

	end(status: JobStatus): void {
		this.status = status;
		this.done = true;
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
				yield { line: this.buffer[cursor], status: this.status, done: false };
				cursor++;
			}
			if (this.done) {
				yield { line: "", status: this.status, done: true };
				return;
			}
			await this.wait();
		}
	}
}
