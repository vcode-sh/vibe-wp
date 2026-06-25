import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SECRET_ENV_KEYS, writeEnvFile } from "./env-writer";

const lineBreak = /\r?\n/;
const envLine = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

async function tempEnv(initial?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vibe-env-"));
  const path = join(dir, "prod.env");
  if (initial !== undefined) {
    await writeFile(path, initial);
  }
  return path;
}

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(lineBreak)) {
    const match = line.match(envLine);
    if (match?.[1]) {
      out[match[1]] = match[2] ?? "";
    }
  }
  return out;
}

describe("writeEnvFile", () => {
  test("writes all values for a fresh (missing) file", async () => {
    const path = await tempEnv();
    await writeEnvFile(path, { WP_HOME: "https://a.com", MARIADB_PASSWORD: "newpw" });
    const env = parse(await readFile(path, "utf8"));
    expect(env.WP_HOME).toBe("https://a.com");
    expect(env.MARIADB_PASSWORD).toBe("newpw");
  });

  test("preserveExisting keeps on-disk secrets but updates non-secret keys", async () => {
    const path = await tempEnv("MARIADB_PASSWORD=oldpw\nWP_HOME=https://old.com\n");
    await writeEnvFile(
      path,
      { MARIADB_PASSWORD: "rotated", WP_HOME: "https://new.com" },
      { preserveExisting: SECRET_ENV_KEYS }
    );
    const env = parse(await readFile(path, "utf8"));
    // Secret retained so it still matches the persisted DB volume.
    expect(env.MARIADB_PASSWORD).toBe("oldpw");
    // Non-secret config still updates.
    expect(env.WP_HOME).toBe("https://new.com");
  });

  test("preserveExisting still appends a secret absent from the file", async () => {
    const path = await tempEnv("WP_HOME=https://old.com\n");
    await writeEnvFile(
      path,
      { REDIS_PASSWORD: "freshredis" },
      { preserveExisting: SECRET_ENV_KEYS }
    );
    const env = parse(await readFile(path, "utf8"));
    expect(env.REDIS_PASSWORD).toBe("freshredis");
  });

  test("a written env file is NEVER world-readable (it holds secrets)", async () => {
    const path = await tempEnv();
    await writeEnvFile(path, { WORDPRESS_DB_PASSWORD: "s3cr3t-db-pw" });
    const { mode } = await stat(path);
    // The core fix: the "other" (world) octal digit must be 0 — no host user
    // outside root/owner (+ the panel group on a managed host) can read the
    // secrets. `mode % 0o10` isolates those low 3 bits without a bitwise op.
    expect(mode % 0o10).toBe(0);
    // Owner can read+write (the file is not locked to nothing). The hundreds
    // octal digit (owner perms) must be at least 6 (rw).
    expect(Math.floor(mode / 0o100) % 0o10).toBeGreaterThanOrEqual(6);
  });
});
