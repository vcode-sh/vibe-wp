import type { OperationLifecycleEvent } from "../contract";

interface Subscriber {
	queue: OperationLifecycleEvent[];
	wake: (() => void) | null;
}

const subscribers = new Set<Subscriber>();

export function publishOperationLifecycleEvent(
	event: OperationLifecycleEvent
): void {
	for (const subscriber of subscribers) {
		subscriber.queue.push(event);
		subscriber.wake?.();
		subscriber.wake = null;
	}
}

export async function* subscribeOperationLifecycleEvents(): AsyncGenerator<OperationLifecycleEvent> {
	const subscriber: Subscriber = { queue: [], wake: null };
	subscribers.add(subscriber);
	try {
		for (;;) {
			if (subscriber.queue.length === 0) {
				await new Promise<void>((resolve) => {
					subscriber.wake = resolve;
				});
			}
			while (subscriber.queue.length > 0) {
				const event = subscriber.queue.shift();
				if (event) {
					yield event;
				}
			}
		}
	} finally {
		subscribers.delete(subscriber);
		subscriber.wake?.();
		subscriber.wake = null;
	}
}
