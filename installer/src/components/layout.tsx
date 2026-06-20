import type { ReactNode } from "react";
import { CONTENT_MAX_WIDTH } from "../app/tokens";

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
