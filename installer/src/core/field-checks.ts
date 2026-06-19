// Plain-language, per-field checks so non-technical users get instant, friendly
// feedback as they type — not a wall of errors at the end.
export interface FieldFeedback {
  text: string;
  tone: "ok" | "warn" | "error";
}

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXAMPLE_HOSTS = /(^|\.)example\.(com|org|net)$/i;

export function checkDomain(value: string): FieldFeedback | undefined {
  const v = value.trim().toLowerCase();
  if (!v) {
    return;
  }
  if (!DOMAIN_PATTERN.test(v)) {
    return { tone: "error", text: "Use a domain like myshop.com (no http://, no spaces)." };
  }
  if (EXAMPLE_HOSTS.test(v)) {
    return { tone: "warn", text: "example.com is a placeholder — use your real domain." };
  }
  return { tone: "ok", text: "Looks good. Point this domain's DNS at this server before install." };
}

export function checkEmail(value: string): FieldFeedback | undefined {
  const v = value.trim().toLowerCase();
  if (!v) {
    return;
  }
  if (!EMAIL_PATTERN.test(v)) {
    return { tone: "error", text: "Enter a real email, like you@yourdomain.com." };
  }
  if (EXAMPLE_HOSTS.test(v)) {
    return { tone: "warn", text: "Use a mailbox you can actually receive at." };
  }
  return { tone: "ok", text: "We'll send the admin login and alerts here." };
}
