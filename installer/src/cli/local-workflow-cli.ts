import {
  createLocalSite,
  deleteLocalSite,
  inventoryLocalSites,
  resetLocalSite,
  resolveLocalWorkflowRoot
} from "../core/local-workflow";
import { siteSlugFromDomain, titleFromDomain } from "../core/site-profile";
import type { InstallerOptions } from "../core/types";

function selectedActionCount(options: InstallerOptions): number {
  return [
    options.localInventory,
    Boolean(options.localCreate),
    Boolean(options.localReset),
    Boolean(options.localDelete)
  ].filter(Boolean).length;
}

function rootFromOptions(options: InstallerOptions): string {
  return resolveLocalWorkflowRoot(process.cwd(), options.localRoot);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runLocalWorkflowCli(options: InstallerOptions): Promise<boolean> {
  if (selectedActionCount(options) === 0) {
    return false;
  }
  if (selectedActionCount(options) > 1) {
    throw new Error("Choose only one local workflow action.");
  }
  const root = rootFromOptions(options);
  if (options.localInventory) {
    printJson(await inventoryLocalSites(root));
    return true;
  }
  if (options.localCreate) {
    const domain = options.localDomain ?? `${options.localCreate}.vibe.local`;
    printJson(
      await createLocalSite({
        root,
        blueprint: {
          domain,
          slug: siteSlugFromDomain(options.localCreate),
          title: options.localTitle ?? titleFromDomain(domain)
        }
      })
    );
    return true;
  }
  if (options.localReset) {
    printJson(await resetLocalSite({ root, slug: options.localReset, yes: options.yes }));
    return true;
  }
  if (options.localDelete) {
    await deleteLocalSite({ root, slug: options.localDelete, yes: options.yes });
    printJson({ deleted: options.localDelete, root });
    return true;
  }
  return false;
}
