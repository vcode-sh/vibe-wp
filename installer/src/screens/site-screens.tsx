import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { useGlyphs } from "../components/glyph-context";
import { ActionRow } from "../components/primitives";
import { Section } from "../components/section";
import {
  defaultInstallDir,
  portPairFromSlug,
  shortPath,
  siteSlugFromDomain,
  stripProtocol
} from "../core/site-profile";
import type { ExistingSite, HostFacts, InstallMode } from "../core/types";
import { primaryFor, secondaryFor, siteActions } from "./site-actions";

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
  const glyphs = useGlyphs();
  const sites = state.host.existingSites;
  const selected = sites.find((site) => site.installDir === state.selectedSiteDir);
  const siteSelected = Boolean(state.selectedSiteDir) && SITE_MODES.has(state.mode);
  const isNewSite = state.mode === "new-site";

  const primaryOptions = [
    ...sites.map((site) => ({
      name: site.productionUrl ? stripProtocol(site.productionUrl) : site.installDir,
      description: `${site.running ? `${glyphs.ok} running` : `${glyphs.pending} stopped`}${site.hasStaging ? " · staging" : ""} · ${shortPath(site.installDir)}`,
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
      {setupHint(state.host) && (
        <text fg={color("warning")} wrapMode="word">
          {setupHint(state.host)}
        </text>
      )}
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
      <ActionRow
        onPrimary={next}
        primary={primaryFor(state.mode)}
        secondary={secondaryFor(state.mode)}
      />
    </box>
  );
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

function setupHint(host: HostFacts): string {
  const missing = [host.docker ? null : "Docker", host.caddy ? null : "Caddy"].filter(Boolean);
  if (missing.length) {
    return `${missing.join(" and ")} not found yet — we'll install ${missing.length > 1 ? "them" : "it"} when you create a site.`;
  }
  return "";
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
