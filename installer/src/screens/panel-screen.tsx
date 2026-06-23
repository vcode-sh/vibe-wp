import type { ScreenProps } from "../app/screen-props";
import { color } from "../app/theme";
import { ChoiceList } from "../components/choice-list";
import { ActionRow, Field } from "../components/primitives";
import { Section } from "../components/section";
import { checkEmail } from "../core/field-checks";
import type { PanelAccessMode } from "../core/panel-access";
import { resolvePanelAccessUrl } from "../core/panel-access";

const ACCESS_MODE_OPTIONS: Array<{
  description: string;
  name: string;
  value: PanelAccessMode;
}> = [
  {
    name: "Magic DNS",
    description:
      "Automatic HTTPS via sslip.io — no domain required. Best for getting started fast.",
    value: "magic-dns"
  },
  {
    name: "Domain",
    description: "Point your own domain at this server. Caddy issues a real Let's Encrypt cert.",
    value: "domain"
  },
  {
    name: "IP + port",
    description: "Self-signed cert at port 8443. Good when a domain or DNS is not available.",
    value: "ip-port"
  },
  {
    name: "Localhost",
    description: "Reachable only from this machine. Useful for local dev.",
    value: "localhost"
  }
];

// Focus layout (domain mode): 0=access, 1=domain, 2=email, 3=password, 4=Continue
// Focus layout (other modes): 0=access, 1=email, 2=password, 3=Continue
export function PanelScreen({ state, update, focusIndex, setFocusIndex, next }: ScreenProps) {
  const showDomain = state.panelAccessMode === "domain";
  // When domain field is hidden, shift subsequent focus indices down by 1.
  const emailIdx = showDomain ? 2 : 1;
  const passwordIdx = showDomain ? 3 : 2;
  const continueIdx = showDomain ? 4 : 3;

  const resolvedUrl = resolvePanelAccessUrl(
    state.panelAccessMode,
    state.productionDomain,
    state.host.publicIp
  );

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text fg={color("muted")} wrapMode="word">
        Choose how you'll reach the panel, then set your owner login. Nothing runs until review.
      </text>

      <Section title="Access mode">
        <ChoiceList
          focused={focusIndex === 0}
          onChange={(value) => update("panelAccessMode", value)}
          options={ACCESS_MODE_OPTIONS}
          value={state.panelAccessMode}
        />
      </Section>

      {showDomain && (
        <Field
          focused={focusIndex === 1}
          hint="DNS A record must already point here — we verify before install"
          label="Panel domain"
          onFocus={() => setFocusIndex(1)}
          onInput={(value) => update("productionDomain", value)}
          value={state.productionDomain}
        />
      )}

      <Section title="Owner login">
        <Field
          feedback={checkEmail(state.adminEmail)}
          focused={focusIndex === emailIdx}
          label="Owner email"
          onFocus={() => setFocusIndex(emailIdx)}
          onInput={(value) => update("adminEmail", value)}
          value={state.adminEmail}
        />
        <Field
          focused={focusIndex === passwordIdx}
          hint="keep it somewhere safe — this is your panel admin password"
          label="Owner password"
          onFocus={() => setFocusIndex(passwordIdx)}
          onInput={(value) => update("adminPassword", value)}
          secret
          value={state.adminPassword}
        />
      </Section>

      <text fg={color("muted")}>
        Panel URL: <text fg={color("accent")}>{resolvedUrl}</text>
      </text>

      <ActionRow
        onPrimary={() => {
          setFocusIndex(continueIdx);
          next();
        }}
        primary="Continue"
        secondary="Review shows exact commands before anything runs"
      />
    </box>
  );
}
