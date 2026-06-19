import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The core must stay headless: no React, no OpenTUI, no reaching up into the
// UI layers. If this fails, a frontend dependency leaked into the shared brain.
const FORBIDDEN_IMPORT = /from\s+["'](react|@opentui|\.\.\/(screens|components|app))/;

test("core/ has no UI dependencies", () => {
  const dir = import.meta.dir;
  const offenders: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!(file.endsWith(".ts") || file.endsWith(".tsx")) || file.endsWith(".test.ts")) {
      continue;
    }
    if (FORBIDDEN_IMPORT.test(readFileSync(join(dir, file), "utf8"))) {
      offenders.push(file);
    }
  }
  expect(offenders).toEqual([]);
});
