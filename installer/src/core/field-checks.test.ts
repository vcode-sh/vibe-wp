import { describe, expect, test } from "bun:test";
import { checkDomain, checkEmail, checkExtDbHost, checkExtHost } from "./field-checks";

describe("field-checks", () => {
  test("checkDomain flags bad input, warns on placeholders, approves real domains", () => {
    expect(checkDomain("")).toBeUndefined();
    expect(checkDomain("not a domain")?.tone).toBe("error");
    expect(checkDomain("example.com")?.tone).toBe("warn");
    expect(checkDomain("shop.test.io")?.tone).toBe("ok");
  });

  test("checkEmail validates format and warns on placeholders", () => {
    expect(checkEmail("nope")?.tone).toBe("error");
    expect(checkEmail("me@example.com")?.tone).toBe("warn");
    expect(checkEmail("me@shop.io")?.tone).toBe("ok");
  });

  test("checkExtDbHost accepts host or host:port", () => {
    expect(checkExtDbHost("db.internal:3306")?.tone).toBe("ok");
    expect(checkExtDbHost("bad host")?.tone).toBe("error");
  });

  test("checkExtHost accepts a bare hostname or IP", () => {
    expect(checkExtHost("redis.internal")?.tone).toBe("ok");
    expect(checkExtHost("has space")?.tone).toBe("error");
  });
});
