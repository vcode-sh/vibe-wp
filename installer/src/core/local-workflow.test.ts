import { describe, expect, it } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalSite,
  deleteLocalSite,
  inventoryLocalSites,
  resetLocalSite,
  resolveLocalWorkflowRoot
} from "./local-workflow";

async function tempRoot() {
  const base = await Bun.$`mktemp -d ${tmpdir()}/vibe-local-workflow.XXXXXX`.text();
  return join(base.trim(), ".vibe-local");
}

describe("local workflow", () => {
  it("rejects roots outside a .vibe-local scope", () => {
    expect(() => resolveLocalWorkflowRoot("/tmp/project", "/tmp/sites")).toThrow(
      "must be inside .vibe-local"
    );
  });

  it("creates an inventory-visible site blueprint without secrets", async () => {
    const root = await tempRoot();
    await createLocalSite({
      root,
      blueprint: { domain: "demo.vibe.local", slug: "demo", title: "Demo" }
    });

    const inventory = await inventoryLocalSites(root);
    expect(inventory.sites).toHaveLength(1);
    expect(inventory.sites[0]).toMatchObject({
      domain: "demo.vibe.local",
      slug: "demo",
      title: "Demo",
      status: "created"
    });

    const raw = await readFile(join(root, "sites", "demo", "blueprint.json"), "utf8");
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("secret");
  });

  it("reset clears runtime files but preserves the blueprint", async () => {
    const root = await tempRoot();
    await createLocalSite({
      root,
      blueprint: { domain: "demo.vibe.local", slug: "demo", title: "Demo" }
    });
    await mkdir(join(root, "sites", "demo", "runtime", "cache"), { recursive: true });
    await Bun.write(join(root, "sites", "demo", "runtime", "cache", "file"), "x");

    await resetLocalSite({ root, slug: "demo", yes: true });

    const inventory = await inventoryLocalSites(root);
    expect(inventory.sites[0]?.status).toBe("reset");
    expect(await Bun.file(join(root, "sites", "demo", "blueprint.json")).exists()).toBe(true);
    expect(await Bun.file(join(root, "sites", "demo", "runtime", "cache", "file")).exists()).toBe(
      false
    );
  });

  it("delete requires confirmation and removes only the local site directory", async () => {
    const root = await tempRoot();
    await createLocalSite({
      root,
      blueprint: { domain: "demo.vibe.local", slug: "demo", title: "Demo" }
    });

    await expect(deleteLocalSite({ root, slug: "demo", yes: false })).rejects.toThrow("--yes");
    await deleteLocalSite({ root, slug: "demo", yes: true });

    const inventory = await inventoryLocalSites(root);
    expect(inventory.sites).toEqual([]);
  });
});
