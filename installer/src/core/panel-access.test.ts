import { describe, expect, it } from "bun:test";
import { resolvePanelAccessUrl } from "./panel-access";

describe("resolvePanelAccessUrl", () => {
  it("derives a dashed sslip.io host for magic-dns", () => {
    expect(resolvePanelAccessUrl("magic-dns", "", "203.0.113.7")).toBe(
      "https://panel.203-0-113-7.sslip.io"
    );
  });
  it("uses ip:8443 for ip-port", () => {
    expect(resolvePanelAccessUrl("ip-port", "", "203.0.113.7")).toBe("https://203.0.113.7:8443");
  });
  it("uses the domain verbatim for domain mode", () => {
    expect(resolvePanelAccessUrl("domain", "panel.acme.com", null)).toBe("https://panel.acme.com");
  });
  it("uses localhost:8443 for localhost", () => {
    expect(resolvePanelAccessUrl("localhost", "", null)).toBe("https://localhost:8443");
  });
});
