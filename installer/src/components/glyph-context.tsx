import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type GlyphName, resolveGlyphs } from "./glyphs";

interface GlyphValue {
  ascii: boolean;
  glyphs: Record<GlyphName, string>;
}

const GlyphContext = createContext<GlyphValue>({
  ascii: false,
  glyphs: resolveGlyphs(false)
});

export function GlyphProvider({ ascii, children }: { ascii: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ ascii, glyphs: resolveGlyphs(ascii) }), [ascii]);
  return <GlyphContext.Provider value={value}>{children}</GlyphContext.Provider>;
}

export function useGlyphs(): Record<GlyphName, string> {
  return useContext(GlyphContext).glyphs;
}

export function useAscii(): boolean {
  return useContext(GlyphContext).ascii;
}
