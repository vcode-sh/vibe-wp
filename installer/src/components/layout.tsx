import type { ReactNode } from "react";
import { CONTENT_MAX_WIDTH, space } from "../app/tokens";

export function Column({
  children,
  maxWidth = CONTENT_MAX_WIDTH
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <box flexDirection="row" flexGrow={1} justifyContent="center">
      <box flexDirection="column" flexGrow={1} maxWidth={maxWidth}>
        {children}
      </box>
    </box>
  );
}

export function Stack({
  children,
  gap = space.sm,
  grow = false
}: {
  children: ReactNode;
  gap?: number;
  grow?: boolean;
}) {
  return (
    <box flexDirection="column" flexGrow={grow ? 1 : undefined} gap={gap}>
      {children}
    </box>
  );
}
