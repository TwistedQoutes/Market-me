import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for Next's request cookies; each test "browser" is its own Map.
const browser = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (browser.cookies.has(name) ? { name, value: browser.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void browser.cookies.set(name, value),
    delete: (name: string) => void browser.cookies.delete(name),
  }),
}));

import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as signup from "@/app/api/auth/signup/route";
import * as product from "@/app/api/products/[id]/route";
import * as products from "@/app/api/products/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { resetStoreCache } from "@/lib/store";

/** A JSON request to the API. */
const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Switches to a fresh browser with no cookies. */
const newBrowser = () => {
  browser.cookies = new Map();
  return browser.cookies;
};

const brief = { name: "Acme", oneLiner: "Invoices", description: "Chases late payments" };
/** Route-handler context for a product id. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marketme-routes-"));
  process.env.MARKETME_DATA_DIR = dir;
  delete process.env.MARKETME_SIGNUPS;
  delete process.env.MARKETME_ALLOWED_EMAILS;
  resetStoreCache();
  newBrowser();
});
afterEach(async () => {
  delete process.env.MARKETME_SIGNUPS;
  await rm(dir, { recursive: true, force: true });
});

describe("auth routes", () => {
  it("requires a session for the API", async () => {
    expect((await products.GET()).status).toBe(401);
    expect((await products.POST(req("/api/products", "POST", brief))).status).toBe(401);
  });

  it("keeps each user's products private", async () => {
    const alice = newBrowser();
    const created = await signup.POST(req("/api/auth/signup", "POST", { email: "Alice@Example.com", password: "password-a" }));
    expect(created.status).toBe(201);
    expect((await created.json()).user.email).toBe("alice@example.com");
    expect(alice.get(SESSION_COOKIE)).toBeTruthy();
    const { product: mine } = await (await products.POST(req("/api/products", "POST", brief))).json();

    // Sign-ups are closed after the first account unless configured.
    newBrowser();
    const closed = await signup.POST(req("/api/auth/signup", "POST", { email: "bob@example.com", password: "password-b" }));
    expect(closed.status).toBe(403);

    process.env.MARKETME_SIGNUPS = "open";
    expect((await signup.POST(req("/api/auth/signup", "POST", { email: "bob@example.com", password: "password-b" }))).status).toBe(201);
    expect(await (await products.GET()).json()).toEqual({ products: [] });
    expect((await product.GET(req(`/api/products/${mine.id}`), ctx(mine.id))).status).toBe(404);
    expect((await product.DELETE(req(`/api/products/${mine.id}`, "DELETE"), ctx(mine.id))).status).toBe(404);

    browser.cookies = alice;
    expect((await product.GET(req(`/api/products/${mine.id}`), ctx(mine.id))).status).toBe(200);
  });

  it("signs in, rejects wrong passwords and duplicate accounts, and signs out", async () => {
    await signup.POST(req("/api/auth/signup", "POST", { email: "a@example.com", password: "password-a" }));
    process.env.MARKETME_SIGNUPS = "open";
    expect((await signup.POST(req("/api/auth/signup", "POST", { email: "a@example.com", password: "other-pass" }))).status).toBe(409);

    const jar = newBrowser();
    expect((await login.POST(req("/api/auth/login", "POST", { email: "a@example.com", password: "wrong-pass" }))).status).toBe(401);
    expect((await login.POST(req("/api/auth/login", "POST", { email: "nobody@example.com", password: "password-a" }))).status).toBe(401);
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    expect((await login.POST(req("/api/auth/login", "POST", { email: "A@example.com", password: "password-a" }))).status).toBe(200);
    const token = jar.get(SESSION_COOKIE)!;
    expect((await products.GET()).status).toBe(200);

    await logout.POST();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    // The old token no longer works server-side either.
    jar.set(SESSION_COOKIE, token);
    expect((await products.GET()).status).toBe(401);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await signup.POST(req("/api/auth/signup", "POST", { email: "a@example.com", password: "short" }));
    expect(res.status).toBe(400);
  });
});
