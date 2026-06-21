import { lazy, Suspense, useEffect, useState } from "react";

const CommandMenu = lazy(() =>
	import("./command-menu").then((m) => ({ default: m.CommandMenu })),
);

/**
 * Always-mounted, near-zero-cost ⌘K listener. The actual palette (cmdk + its
 * Radix dialog stack, ~25 kB gzipped) is only imported the first time the user
 * opens it, keeping it out of the authenticated shell chunk.
 */
export function CommandMenuLauncher() {
	const [open, setOpen] = useState(false);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setLoaded(true);
				setOpen((o) => !o);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	// Mount lazily on first open, then keep mounted so the dialog can animate
	// closed and reopen instantly without re-fetching the chunk.
	if (!loaded) {
		return null;
	}

	return (
		<Suspense fallback={null}>
			<CommandMenu onOpenChange={setOpen} open={open} />
		</Suspense>
	);
}
