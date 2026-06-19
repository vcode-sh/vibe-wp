import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ActionRow, Field, ToggleRow } from "../components/primitives";
import { checkDomain } from "../core/field-checks";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stagingDomainFor,
  titleFromDomain
} from "../core/site-profile";

const DEFAULT_TITLES = new Set(["", "Vibe WP", "My Site"]);

export function DomainScreen({ state, update, focusIndex, next }: ScreenProps) {
  function updateProductionDomain(value: string) {
    update("productionDomain", value);
    const slug = siteSlugFromDomain(value);
    const ports = portPairFromSlug(slug);
    update("siteSlug", slug);
    update("productionHttpPort", ports.production);
    update("stagingHttpPort", ports.staging);
    // Smart defaults so non-technical users barely fill anything: staging follows
    // the domain, and the title is guessed until they customise it.
    update("stagingDomain", stagingDomainFor(value));
    if (DEFAULT_TITLES.has(state.siteTitle.trim())) {
      update("siteTitle", titleFromDomain(value) || state.siteTitle);
    }
    if (!state.selectedSiteDir && state.mode === "new-site") {
      update("installDir", defaultInstallDir(slug, state.host.existingSites.length));
    }
  }

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <Field
        feedback={checkDomain(state.productionDomain)}
        focused={focusIndex === 0}
        label="Production domain"
        onInput={updateProductionDomain}
        value={state.productionDomain}
      />
      <ToggleRow
        focused={focusIndex === 1}
        label="Also serve www alias"
        onToggle={() => update("wwwAlias", !state.wwwAlias)}
        value={state.wwwAlias}
      />
      <Field
        focused={focusIndex === 2}
        label="Staging domain"
        onInput={(value) => update("stagingDomain", value)}
        value={state.stagingDomain}
      />
      <Field
        focused={focusIndex === 3}
        label="Site slug"
        onInput={(value) => update("siteSlug", value)}
        value={state.siteSlug}
      />
      <box flexDirection="row" gap={2}>
        <Field
          focused={focusIndex === 4}
          grow
          label="Production port"
          onInput={(value) => update("productionHttpPort", value)}
          value={state.productionHttpPort}
        />
        <Field
          focused={focusIndex === 5}
          grow
          label="Staging port"
          onInput={(value) => update("stagingHttpPort", value)}
          value={state.stagingHttpPort}
        />
      </box>
      <text fg={color("muted")}>
        Production binds to 127.0.0.1:{state.productionHttpPort}. Staging binds to 127.0.0.1:
        {state.stagingHttpPort}.
      </text>
      <ActionRow
        onPrimary={next}
        primary="Continue"
        secondary="DNS checks are part of the execution plan"
      />
    </box>
  );
}
