export type PanelAccessMode = "domain" | "magic-dns" | "ip-port" | "localhost";

export const PANEL_ACCESS_MODES: PanelAccessMode[] = [
  "domain",
  "magic-dns",
  "ip-port",
  "localhost"
];

// Display/Done URL. MUST mirror bin/panel resolve_access() (Phase 1).
export function resolvePanelAccessUrl(
  mode: PanelAccessMode,
  domain: string,
  publicIp: string | null
): string {
  switch (mode) {
    case "domain":
      return `https://${domain}`;
    case "magic-dns": {
      const dashed = (publicIp ?? "").replaceAll(".", "-");
      return `https://panel.${dashed}.sslip.io`;
    }
    case "ip-port":
      return `https://${publicIp ?? ""}:8443`;
    case "localhost":
      return "https://localhost:8443";
    default:
      return "https://localhost:8443";
  }
}
