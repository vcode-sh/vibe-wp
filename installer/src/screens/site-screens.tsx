import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { useGlyphs } from "../components/glyph-context";
import { ActionRow } from "../components/primitives";
import { Section } from "../components/section";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stripProtocol
} from "../core/site-profile";
import type { ExistingSite, HostFacts, InstallMode } from "../core/types";

const SITE_MODES = new Set<InstallMode>([
  "manage-existing",
  "remove-existing",
  "update-existing",
  "staging-only"
]);

const CREATE_OPTIONS = [
  {
    name: "+ Create a new WordPress site",
    description: "Fresh install: production, optional staging, and tuned settings.",
    value: "new-site" as const
  },
  {
    name: "+ Use external database & Redis",
    description: "Bring your own MariaDB and Redis; only WordPress and Nginx run in Docker.",
    value: "external-services" as const
  }
];

const SETUP_CHOICES = [
  {
    name: "Quick setup",
    description: "Just domain and email; safe defaults for the rest.",
    value: "quick"
  },
  {
    name: "Custom",
    description: "Walk through staging, performance, backups, AI, location.",
    value: "custom"
  }
];

// The landing control panel: existing sites first (pick one to act on it), with
// create actions as peers — a manager, not a linear wizard.
export function SitesScreen({ state, update, focusIndex, next }: ScreenProps) {
  const sites = state.host.existingSites;
  const selected = sites.find((site) => site.installDir === state.selectedSiteDir);
  const siteSelected = Boolean(state.selectedSiteDir) && SITE_MODES.has(state.mode);
  const isNewSite = state.mode === "new-site";

  const primaryOptions = [
    ...sites.map((site) => ({
      name: site.productionUrl ?? site.installDir,
      description: `Manage this site${site.hasStaging ? " · has staging" : ""} · ${site.installDir}`,
      value: site.installDir
    })),
    ...CREATE_OPTIONS
  ];
  const primaryValue = siteSelected ? state.selectedSiteDir : state.mode;

  function pickPrimary(value: string) {
    if (value === "new-site" || value === "external-services") {
      update("selectedSiteDir", "");
      setNewMode(value);
      return;
    }
    const site = sites.find((candidate) => candidate.installDir === value);
    if (site) {
      selectSite(update, site);
      update("mode", "manage-existing");
    }
  }

  function setNewMode(mode: InstallMode) {
    update("mode", mode);
    const slug = siteSlugFromDomain(state.productionDomain);
    const ports = portPairFromSlug(slug);
    update("siteSlug", slug);
    update("installDir", defaultInstallDir(slug, sites.length));
    update("productionHttpPort", ports.production);
    update("stagingHttpPort", ports.staging);
  }

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <ServerLine host={state.host} />
      <Section title={sites.length ? `Your sites (${sites.length})` : "No sites here yet"}>
        <ChoiceList
          focused={focusIndex === 0}
          onChange={pickPrimary}
          options={primaryOptions}
          value={primaryValue}
        />
      </Section>
      {siteSelected && selected && (
        <Section title={`What about ${selected.productionUrl ?? selected.installDir}?`}>
          <ChoiceList
            focused={focusIndex === 1}
            onChange={(mode) => update("mode", mode as InstallMode)}
            options={siteActions(selected)}
            value={state.mode}
          />
        </Section>
      )}
      {isNewSite && (
        <Section title="How much do you want to set up?">
          <ChoiceList
            focused={focusIndex === 1}
            onChange={(choice) => setSetup(update, choice === "quick")}
            options={SETUP_CHOICES}
            value={state.quickInstall ? "quick" : "custom"}
          />
        </Section>
      )}
      <ActionRow onPrimary={next} primary="Open" secondary={secondaryFor(state.mode)} />
    </box>
  );
}

function siteActions(
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
      description: "Refresh the checkout and restart in place.",
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

function selectSite(update: ScreenProps["update"], site: ExistingSite): void {
  update("selectedSiteDir", site.installDir);
  update("installDir", site.installDir);
  update("stagingEnabled", site.hasStaging);
  if (site.productionUrl) {
    const domain = stripProtocol(site.productionUrl);
    update("productionDomain", domain);
    update("siteSlug", siteSlugFromDomain(domain));
  }
  if (site.stagingUrl) {
    update("stagingDomain", stripProtocol(site.stagingUrl));
  }
}

function setSetup(update: ScreenProps["update"], quick: boolean): void {
  update("quickInstall", quick);
  if (quick) {
    update("stagingEnabled", false);
  }
}

function ServerLine({ host }: { host: HostFacts }) {
  const glyphs = useGlyphs();
  const mark = (ok: boolean) => (ok ? glyphs.ok : glyphs.warn);
  const mem = host.totalMemoryMb ? `${host.totalMemoryMb} MB` : "unknown RAM";
  return (
    <text fg={color("muted")} truncate>
      Server: {host.osName} · {mem} · Docker {mark(Boolean(host.docker))} · Caddy{" "}
      {mark(Boolean(host.caddy))}
    </text>
  );
}

function secondaryFor(mode: InstallMode): string {
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
