import type { ScreenProps } from "../app/screen-props";
import { modeOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { ActionRow } from "../components/primitives";
import { Section } from "../components/section";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stripProtocol
} from "../core/site-profile";
import type { ExistingSite, InstallMode } from "../core/types";

// Intents that act on an already-installed site (so we must ask which one).
const SITE_MODES = new Set<InstallMode>([
  "manage-existing",
  "remove-existing",
  "update-existing",
  "staging-only"
]);

export function SitesScreen({ state, update, focusIndex, next }: ScreenProps) {
  const sites = state.host.existingSites;
  const hasSites = sites.length > 0;
  // Hide existing-site intents when nothing is installed yet.
  const intents = modeOptions.filter(
    (option) => hasSites || option.value === "new-site" || option.value === "external-services"
  );
  const needsSite = SITE_MODES.has(state.mode) && hasSites;

  function setMode(mode: InstallMode) {
    update("mode", mode);
    if (mode === "new-site") {
      const slug = siteSlugFromDomain(state.productionDomain);
      const ports = portPairFromSlug(slug);
      update("siteSlug", slug);
      update("installDir", defaultInstallDir(slug, sites.length));
      update("productionHttpPort", ports.production);
      update("stagingHttpPort", ports.staging);
    }
  }

  function selectSite(site: ExistingSite) {
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

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Section title="What do you want to do?">
        <ChoiceList
          focused={focusIndex === 0}
          onChange={setMode}
          options={intents}
          value={state.mode}
        />
      </Section>
      {needsSite ? (
        <Section title="Which site?">
          <ChoiceList
            focused={focusIndex === 1}
            onChange={(dir) => {
              const site = sites.find((candidate) => candidate.installDir === dir);
              if (site) {
                selectSite(site);
              }
            }}
            options={sites.map((site) => ({
              name: site.productionUrl ?? site.installDir,
              description: `${site.installDir}${site.hasStaging ? "  ·  has staging" : ""}`,
              value: site.installDir
            }))}
            value={state.selectedSiteDir || sites[0]?.installDir || ""}
          />
        </Section>
      ) : (
        <text fg={color("subtle")}>
          {hasSites
            ? `${sites.length} existing install(s) detected on this host.`
            : "No existing Vibe WP installs detected — let's create your first site."}
        </text>
      )}
      <ActionRow onPrimary={next} primary="Continue" secondary={secondaryFor(state.mode)} />
    </box>
  );
}

function secondaryFor(mode: InstallMode): string {
  if (mode === "manage-existing") {
    return "Run status, smoke checks, and diagnostics";
  }
  if (mode === "remove-existing") {
    return "Safety backup first, then stop containers";
  }
  return "Each intent uses a different task plan";
}
