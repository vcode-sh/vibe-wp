import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export type LocalSiteStatus = "created" | "reset";

export interface LocalSiteBlueprint {
  domain: string;
  slug: string;
  title: string;
}

export interface LocalSiteRecord extends LocalSiteBlueprint {
  path: string;
  status: LocalSiteStatus;
}

export interface LocalInventory {
  root: string;
  sites: LocalSiteRecord[];
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function resolveLocalWorkflowRoot(cwd = process.cwd(), root?: string): string {
  const resolved = resolve(cwd, root ?? ".vibe-local");
  const marker = `${sep}.vibe-local`;
  if (!(resolved.endsWith(marker) || resolved.includes(`${marker}${sep}`))) {
    throw new Error("Local workflow root must be inside .vibe-local.");
  }
  return resolved;
}

function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid local site slug: ${slug}`);
  }
}

function siteDir(root: string, slug: string): string {
  assertSlug(slug);
  return join(resolveLocalWorkflowRoot(process.cwd(), root), "sites", slug);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return (await Bun.file(path).json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

export async function inventoryLocalSites(root: string): Promise<LocalInventory> {
  const safeRoot = resolveLocalWorkflowRoot(process.cwd(), root);
  const sitesRoot = join(safeRoot, "sites");
  const names = await readdir(sitesRoot).catch(() => []);
  const sites: LocalSiteRecord[] = [];
  for (const name of names.sort()) {
    if (!SLUG_PATTERN.test(name)) {
      continue;
    }
    const dir = join(sitesRoot, name);
    const blueprint = await readJson<LocalSiteBlueprint>(join(dir, "blueprint.json"));
    if (!blueprint) {
      continue;
    }
    const metadata = await readJson<{ status?: LocalSiteStatus }>(join(dir, "state.json"));
    sites.push({
      ...blueprint,
      path: dir,
      status: metadata?.status === "reset" ? "reset" : "created"
    });
  }
  return { root: safeRoot, sites };
}

export async function createLocalSite(input: {
  blueprint: LocalSiteBlueprint;
  root: string;
}): Promise<LocalSiteRecord> {
  assertSlug(input.blueprint.slug);
  const dir = siteDir(input.root, input.blueprint.slug);
  await mkdir(join(dir, "runtime"), { recursive: true });
  await writeJson(join(dir, "blueprint.json"), input.blueprint);
  await writeJson(join(dir, "state.json"), { status: "created" });
  return { ...input.blueprint, path: dir, status: "created" };
}

export async function resetLocalSite(input: {
  root: string;
  slug: string;
  yes: boolean;
}): Promise<LocalSiteRecord> {
  if (!input.yes) {
    throw new Error("Local reset requires --yes.");
  }
  const dir = siteDir(input.root, input.slug);
  const blueprint = await readJson<LocalSiteBlueprint>(join(dir, "blueprint.json"));
  if (!blueprint) {
    throw new Error(`Local site not found: ${input.slug}`);
  }
  await rm(join(dir, "runtime"), { force: true, recursive: true });
  await mkdir(join(dir, "runtime"), { recursive: true });
  await writeJson(join(dir, "state.json"), { status: "reset" });
  return { ...blueprint, path: dir, status: "reset" };
}

export async function deleteLocalSite(input: {
  root: string;
  slug: string;
  yes: boolean;
}): Promise<void> {
  if (!input.yes) {
    throw new Error("Local delete requires --yes.");
  }
  const dir = siteDir(input.root, input.slug);
  await rm(dir, { force: true, recursive: true });
}
