import { describe, expect, it } from "bun:test";
import { redact } from "./redaction";

describe("redact", () => {
  it("redacts human-readable password lines from command output", () => {
    const output = redact("WordPress admin password: generated-secret-value");

    expect(output).not.toContain("generated-secret-value");
    expect(output).toContain("WordPress admin password: [redacted]");
  });
});
