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
  // children to fit and they overdraw each other. The MainPanel clips any genuine
  // overflow at the panel edge, so no overflow prop is needed here (and adding one
  // mis-clips the first column of wrapped text).
  return (
    <box alignItems="flex-start" flexDirection="row" flexGrow={1} justifyContent="center">
      <box flexDirection="column" flexGrow={1} flexShrink={0} maxWidth={maxWidth}>
        {children}
      </box>
    </box>
  );
}
