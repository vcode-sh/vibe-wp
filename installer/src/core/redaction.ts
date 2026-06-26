const secretKeys = [
  "PASSWORD",
  "SECRET",
  "SALT",
  "KEY",
  "TOKEN",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "ANTHROPIC_API_KEY"
];

export function redact(value: string): string {
  let output = value;
  for (const key of secretKeys) {
    const pattern = new RegExp(`(${key}=)([^\\s]+)`, "gi");
    output = output.replace(pattern, "$1[redacted]");
  }
  output = output.replace(/((?:password|secret|token|api key)\s*:\s*)(\S+)/gi, "$1[redacted]");
  output = output.replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[redacted-openai-key]");
  output = output.replace(
    /([A-Za-z0-9_-]{24,}\\.[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,})/g,
    "[redacted-token]"
  );
  return output;
}

export function redactPlan<T>(plan: T): T {
  return JSON.parse(
    JSON.stringify(plan, (key, value) => {
      if (
        typeof value === "string" &&
        secretKeys.some((secretKey) => key.toUpperCase().includes(secretKey))
      ) {
        return value ? "[redacted]" : "";
      }
      return value;
    })
  ) as T;
}
