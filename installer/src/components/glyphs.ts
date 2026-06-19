export type GlyphName =
  | "done"
  | "active"
  | "pending"
  | "ok"
  | "missing"
  | "warn"
  | "enter"
  | "tab"
  | "arrows"
  | "bullet"
  | "wordmark";

const UNICODE: Record<GlyphName, string> = {
  done: "✓",
  active: "▸",
  pending: "○",
  ok: "●",
  missing: "◍",
  warn: "⚠",
  enter: "⏎",
  tab: "⇥",
  arrows: "↑↓",
  bullet: "•",
  wordmark: "◇"
};

const ASCII: Record<GlyphName, string> = {
  done: "x",
  active: ">",
  pending: "-",
  ok: "*",
  missing: "!",
  warn: "!",
  enter: "Enter",
  tab: "Tab",
  arrows: "Up/Dn",
  bullet: "-",
  wordmark: "#"
};

const UTF8_PATTERN = /utf-?8/i;

export function resolveGlyphs(ascii: boolean): Record<GlyphName, string> {
  return ascii ? ASCII : UNICODE;
}

export function shouldUseAscii(opts: { ascii: boolean; env?: NodeJS.ProcessEnv }): boolean {
  if (opts.ascii) {
    return true;
  }
  const env = opts.env ?? process.env;
  const locale = env.LC_ALL || env.LANG || "";
  if (locale && !UTF8_PATTERN.test(locale)) {
    return true;
  }
  return env.TERM === "dumb";
}

export function spinnerFrames(ascii: boolean): string[] {
  return ascii ? ["|", "/", "-", "\\"] : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
}
