import type { ExistingSite, InstallMode } from "../core/types";

// What you can do with a selected existing site, calm-to-scary, with "Remove"
// last. Staging is offered only when the site doesn't already have one.
export function siteActions(
  site: ExistingSite
): Array<{ name: string; description: string; value: string }> {
  return [
    {
      name: "Manage",
      description: "Health, backups, cache, restart, staging, restore.",
      value: "manage-existing"
    },
    {
      name: "Update",
      description: "Refresh the files and restart in place.",
      value: "update-existing"
    },
    ...(site.hasStaging
      ? []
      : [
          {
            name: "Add staging",
            description: "Attach a private staging copy.",
            value: "staging-only"
          }
        ]),
    {
      name: "Remove",
      description: "Safety backup, then stop. Files kept (use --purge to delete).",
      value: "remove-existing"
    }
  ];
}

// The primary button verb matches the action so it never reads "Open" while
// about to remove or create a site.
export function primaryFor(mode: InstallMode): string {
  const verbs: Record<InstallMode, string> = {
    "manage-existing": "Open",
    "update-existing": "Update",
    "remove-existing": "Remove",
    "staging-only": "Add staging",
    "new-site": "Start setup",
    "external-services": "Start setup",
    "panel-bootstrap": "Set up panel"
  };
  return verbs[mode];
}

export function secondaryFor(mode: InstallMode): string {
  if (mode === "manage-existing") {
    return "Open the site's control panel";
  }
  if (mode === "remove-existing") {
    return "Safety backup first, then stop";
  }
  if (mode === "update-existing") {
    return "Refresh and restart in place";
  }
  if (mode === "staging-only") {
    return "Attach a staging copy";
  }
  return "Start a guided install";
}
