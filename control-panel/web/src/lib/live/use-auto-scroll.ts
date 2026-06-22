import { type RefObject, useEffect, useRef } from "react";

/**
 * Returns true when the element is at or near the bottom (within `threshold`
 * px). Exported so it can be unit-tested independently of the DOM hook.
 */
export function isNearBottom(
	scrollTop: number,
	scrollHeight: number,
	clientHeight: number,
	threshold = 32
): boolean {
	return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * Smooth auto-scroll-to-bottom hook for streaming log views.
 *
 * Attach the returned ref to the **scrollable** element. Whenever `dependency`
 * changes (new content appended) the element is scrolled to the bottom — but
 * only while the user is "pinned" (at/near the bottom). If the user scrolls up,
 * auto-follow pauses and re-engages automatically once they scroll back down.
 *
 * @param dependency  Any value whose change signals new content (e.g. `lines.length`).
 * @returns           A ref to attach to the scrollable element.
 */
export function useAutoScroll<T extends HTMLElement>(
	dependency: unknown
): RefObject<T | null> {
	const ref = useRef<T | null>(null);
	// Track whether the user is pinned to the bottom; default true so the
	// initial render scrolls to bottom automatically.
	const pinned = useRef(true);

	// Attach a scroll listener to update the pinned state.
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}

		function onScroll() {
			if (!el) {
				return;
			}
			pinned.current = isNearBottom(
				el.scrollTop,
				el.scrollHeight,
				el.clientHeight
			);
		}

		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []); // runs once after mount; ref.current is stable

	// Scroll to bottom whenever `dependency` changes, if pinned.
	// biome-ignore lint/correctness/useExhaustiveDependencies: dependency is the intentional trigger; ref/pinned are stable refs
	useEffect(() => {
		const el = ref.current;
		if (!(el && pinned.current)) {
			return;
		}
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [dependency]);

	return ref;
}
