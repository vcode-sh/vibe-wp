import { describe, expect, test } from "bun:test";
import { validateDomain, validateEmail } from "./validation";

describe("validation", () => {
  test("blocks placeholder domains before execution", () => {
    expect(validateDomain("example.com")).toBe("Use a real domain with DNS pointing to this VPS.");
    expect(validateDomain("stage.example.com")).toBe(
      "Use a real domain with DNS pointing to this VPS."
    );
    expect(validateDomain("local.test")).toBe("Use a real domain with DNS pointing to this VPS.");
  });

  test("blocks placeholder admin email", () => {
    expect(validateEmail("admin@example.com")).toBe("Use a real mailbox, not example.com.");
  });
});
