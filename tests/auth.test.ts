import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canSignUp } from "@/lib/auth/policy";
import { RateLimiter } from "@/lib/auth/rate-limit";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });
});

describe("sign-up policy", () => {
  it("always lets the first account in", () => {
    expect(canSignUp("anyone@example.com", 0, {})).toBe(true);
  });

  it("is closed after the first account unless configured", () => {
    expect(canSignUp("b@example.com", 1, {})).toBe(false);
    expect(canSignUp("b@example.com", 1, { MARKETME_SIGNUPS: "open" })).toBe(true);
  });

  it("allows listed emails and domains", () => {
    const env = { MARKETME_ALLOWED_EMAILS: " Pat@Example.com , *@acme.io " };
    expect(canSignUp("pat@example.com", 3, env)).toBe(true);
    expect(canSignUp("sam@acme.io", 3, env)).toBe(true);
    expect(canSignUp("sam@notacme.io", 3, env)).toBe(false);
    expect(canSignUp("sam@acme.io.evil.com", 3, env)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("only allows same-site paths", () => {
    expect(safeNextPath("/products/1?tab=leads")).toBe("/products/1?tab=leads");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("RateLimiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect([limiter.attempt("k", 0), limiter.attempt("k", 1), limiter.attempt("k", 2)]).toEqual([true, true, false]);
    expect(limiter.attempt("other", 2)).toBe(true);
    expect(limiter.attempt("k", 1001)).toBe(true);
    limiter.attempt("k", 1002);
    limiter.reset("k");
    expect(limiter.attempt("k", 1003)).toBe(true);
  });
});
