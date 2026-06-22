import { useEffect, useReducer, useRef } from "react";

import type { StreamEvent } from "@/data/types";
import { initialLiveState, type LiveState, liveReducer } from "./live-reducer";

type Source = () =>
	| AsyncIterable<StreamEvent>
	| Promise<AsyncIterable<StreamEvent>>;

export function useLiveStream(source: Source, active: boolean): LiveState {
	const [state, dispatch] = useReducer(
		liveReducer,
		Date.now(),
		initialLiveState
	);
	// Hold the latest source in a ref so the subscription effect depends only on
	// `active` — the caller's source closure changes identity every render but we
	// must not re-subscribe on every render.
	const sourceRef = useRef(source);
	sourceRef.current = source;

	useEffect(() => {
		if (!active) {
			return;
		}
		// Reset state for a fresh (re)subscription so a reused, still-mounted
		// runner doesn't show the previous operation's lines.
		dispatch({ reset: true, at: Date.now() });
		let on = true;
		(async () => {
			const iter = await sourceRef.current();
			for await (const event of iter) {
				if (!on) {
					break;
				}
				dispatch({ event, at: Date.now() });
			}
		})().catch(() => undefined);
		return () => {
			on = false;
		};
	}, [active]);

	return state;
}
