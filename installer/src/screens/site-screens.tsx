import { TextAttributes } from "@opentui/core";
import type { ScreenProps } from "../app/screen-props";
import { modeOptions } from "../app/steps";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { ActionRow, Panel } from "../components/primitives";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stripProtocol
} from "../core/site-profile";
import type { ExistingSite, InstallMode } from "../core/types";

export function SitesScreen({ state, update, focusIndex, next }: ScreenProps) {
  const sites = state.host.existingSites;

  function selectSite(site: ExistingSite) {
    update("selectedSiteDir", site.installDir);
    update("installDir", site.installDir);
    update("mode", "manage-existing");
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

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <box flexDirection="row" gap={1}>
        <Panel
          content={
            sites.length
              ? `${sites.length} Vibe WP installation(s) found on this VPS.`
              : "No existing Vibe WP installations detected under /opt or /srv."
          }
          title="SERVER INVENTORY"
        />
        <Panel
          content={`Selected: ${state.selectedSiteDir || "none"}\nNext install: ${state.installDir}`}
          title="CURRENT TARGET"
        />
      </box>
      {sites.length > 0 && <SiteInventory selected={state.selectedSiteDir} sites={sites} />}
      <ChoiceList
        focused={focusIndex === 0}
        onChange={(value) => setMode(value)}
        options={modeOptions}
        value={state.mode}
      />
      {sites.length > 0 && (
        <ChoiceList
          focused={focusIndex === 1}
          onChange={(value) => {
            const site = sites.find((candidate) => candidate.installDir === value);
            if (site) {
              selectSite(site);
            }
          }}
          options={sites.map((site) => ({
            name: site.productionUrl ?? site.installDir,
            description: `${site.installDir}${site.hasStaging ? " with staging" : ""}`,
            value: site.installDir
          }))}
          value={state.selectedSiteDir || sites[0]?.installDir || ""}
        />
      )}
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="Create, manage, and remove flows use different task plans"
      />
    </box>
  );
}

function SiteInventory({ sites, selected }: { selected: string; sites: ExistingSite[] }) {
  return (
    <box backgroundColor={color("panel")} border borderColor={color("border")} padding={1}>
      <box flexDirection="column" gap={1}>
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          Detected installations
        </text>
        {sites.slice(0, 4).map((site) => (
          <box flexDirection="row" gap={1} key={site.installDir}>
            <text fg={site.installDir === selected ? color("accent") : color("subtle")}>
              {site.installDir === selected ? ">" : "-"}
            </text>
            <text fg={color("text")} truncate>
              {site.productionUrl ?? site.installDir}
            </text>
            <text fg={color("muted")} truncate>
              {site.productionProject ?? "unknown project"}
            </text>
          </box>
        ))}
      </box>
    </box>
  );
}
