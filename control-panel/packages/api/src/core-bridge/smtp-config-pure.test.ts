import { describe, expect, it } from "vitest";
import { maskSmtpRow, mergeSmtpConfig, toEnv } from "./smtp-config-pure";

const row = (o: Record<string, unknown> = {}) => ({
  siteId: "s", mode: null, host: null, port: null, secure: null, auth: null,
  username: null, password: null, fromAddress: null, fromName: null, ...o,
});

describe("mergeSmtpConfig", () => {
  it("site overrides global field-by-field", () => {
    const m = mergeSmtpConfig(row({ host: "g", mode: "relay" }), row({ host: "s" }));
    expect(m.host).toBe("s");
    expect(m.mode).toBe("relay");
  });
  it("falls back to global when no site row", () =>
    expect(mergeSmtpConfig(row({ host: "g" }), null).host).toBe("g"));
});

describe("toEnv", () => {
  it("maps to SMTP_* keys with sane defaults", () => {
    const e = toEnv(mergeSmtpConfig(row({ mode: "relay", host: "h", port: 587, secure: "starttls", auth: "on", username: "u", password: "p", fromAddress: "f@x", fromName: "N" }), null));
    expect(e.SMTP_MODE).toBe("relay");
    expect(e.SMTP_HOST).toBe("h");
    expect(e.SMTP_PORT).toBe("587");
    expect(e.SMTP_PASSWORD).toBe("p");
    expect(e.SMTP_FROM).toBe("f@x");
  });
  it("omits SMTP_PASSWORD when null (preserve-existing semantics)", () =>
    expect("SMTP_PASSWORD" in toEnv(mergeSmtpConfig(row({ mode: "relay" }), null))).toBe(false));
});

describe("maskSmtpRow", () => {
  it("replaces password with hasPassword boolean", () => {
    const m = maskSmtpRow(row({ password: "secret", host: "h" }))!;
    expect((m as Record<string, unknown>).password).toBeUndefined();
    expect((m as Record<string, unknown>).hasPassword).toBe(true);
    expect((m as Record<string, unknown>).host).toBe("h");
  });
  it("hasPassword false when empty/null", () =>
    expect((maskSmtpRow(row())! as Record<string, unknown>).hasPassword).toBe(false));
  it("null row -> null", () => expect(maskSmtpRow(null)).toBeNull());
});
