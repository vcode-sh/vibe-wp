import type { ScrollBoxRenderable } from "@opentui/core";
import { type ReactNode, useEffect, useRef } from "react";
import { CONTENT_MAX_WIDTH, FOCUS_ID } from "../app/tokens";

export function Column({
  children,
  maxWidth = CONTENT_MAX_WIDTH
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  // alignItems flex-start keeps the content column at its natural height instead
  // of stretching it to fill the panel — without that, Yoga compresses the
  // fixed-height children to fit and they overdraw each other. The MainPanel
  // clips any genuine vertical overflow at the panel edge. (Don't set flexShrink
  // on the inner box: that blocks horizontal shrink and clips wide lines.)
  return (
    <box alignItems="flex-start" flexDirection="row" flexGrow={1} justifyContent="center">
      <box flexDirection="column" flexGrow={1} maxWidth={maxWidth}>
        {children}
      </box>
    </box>
  );
}

// Scrolls so the focused control stays visible on terminals too short to show
// the whole screen. The focused control tags itself with FOCUS_ID; we bring it
// into view whenever focus moves. Mouse-wheel scrolling still works too.
export function ScrollViewport({
  children,
  focusIndex
}: {
  children: ReactNode;
  focusIndex: number;
}) {
  const ref = useRef<ScrollBoxRenderable | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusIndex is the intended re-scroll trigger, not read in the body.
  useEffect(() => {
    ref.current?.scrollChildIntoView(FOCUS_ID);
  }, [focusIndex]);
  return (
    <scrollbox flexGrow={1} ref={ref} scrollX={false} scrollY={true}>
      {children}
    </scrollbox>
  );
}
