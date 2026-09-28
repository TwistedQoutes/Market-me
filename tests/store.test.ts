import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProduct,
  createSession,
  createUser,
  deleteProduct,
  findSessionUser,
  getProduct,
  listProducts,
  resetStoreCache,
  updateProduct,
} from "@/lib/store";
import { ProductInput, ProductPatch } from "@/lib/types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marketme-store-"));
  process.env.MARKETME_DATA_DIR = dir;
  resetStoreCache();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const brief = ProductInput.parse({
  name: "Acme",
  oneLiner: "One-liner",
  description: "Description",
  website: "https://acme.example",
  pricing: "$10/month",
});

describe("partial product updates", () => {
  it("only changes the fields the client sent", async () => {
    const product = await createProduct("owner", brief);
    const patch = ProductPatch.parse({ name: "Acme 2" });
    expect(patch).toEqual({ name: "Acme 2" });

    await updateProduct("owner", product.id, patch);
    expect(await getProduct("owner", product.id)).toMatchObject({
      name: "Acme 2",
      website: "https://acme.example",
      pricing: "$10/month",
    });
  });
});

describe("failed writes", () => {
  it("don't leave unsaved changes visible in memory", async () => {
    await createProduct("owner", brief);
    // Make the atomic-write temp path a directory so the next persist fails.
    await mkdir(path.join(dir, `db.json.${process.pid}.tmp`));

    await expect(createProduct("owner", { ...brief, name: "Never saved" })).rejects.toThrow();
    expect((await listProducts("owner")).map((p) => p.name)).toEqual(["Acme"]);
  });
});

describe("product ownership", () => {
  it("keeps each user's products private", async () => {
    const mine = await createProduct("alice", brief);
    await createProduct("bob", { ...brief, name: "Bob's" });

    expect((await listProducts("alice")).map((p) => p.name)).toEqual(["Acme"]);
    expect(await getProduct("bob", mine.id)).toBeNull();
    expect(await updateProduct("bob", mine.id, { name: "Hijacked" })).toBeNull();
    expect(await deleteProduct("bob", mine.id)).toBe(false);
    expect(await getProduct("alice", mine.id)).toMatchObject({ name: "Acme" });
  });
});

describe("users and sessions", () => {
  it("rejects a second account with the same email", async () => {
    expect(await createUser("a@example.com", "hash")).toMatchObject({ email: "a@example.com" });
    expect(await createUser("a@example.com", "hash")).toBeNull();
  });

  it("never exposes the password hash", async () => {
    const user = await createUser("a@example.com", "secret-hash");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("gives the first account the products created before accounts existed", async () => {
    // A datastore from before accounts: products have no ownerId.
    const legacy = { ...brief, id: "legacy", createdAt: "2026-01-01", updatedAt: "2026-01-01", strategy: null, strategyGeneratedAt: null };
    await writeFile(path.join(dir, "db.json"), JSON.stringify({ products: [legacy], leads: [], assets: [] }));
    resetStoreCache();

    const first = await createUser("owner@example.com", "hash");
    const second = await createUser("other@example.com", "hash");
    expect((await listProducts(first!.id)).map((p) => p.id)).toEqual(["legacy"]);
    expect(await listProducts(second!.id)).toEqual([]);
    expect(JSON.parse(await readFile(path.join(dir, "db.json"), "utf8")).products[0].ownerId).toBe(first!.id);
  });

  it("resolves live sessions and ignores expired ones", async () => {
    const user = await createUser("a@example.com", "hash");
    await createSession(user!.id, "live", new Date(Date.now() + 60_000));
    await createSession(user!.id, "expired", new Date(Date.now() - 1));

    expect(await findSessionUser("live")).toMatchObject({ email: "a@example.com" });
    expect(await findSessionUser("expired")).toBeNull();
    expect(await findSessionUser("unknown")).toBeNull();
  });
});

describe("multiple copies of the store module", () => {
  it("share one database, since Next.js can bundle the module more than once", async () => {
    vi.resetModules();
    const a = await import("@/lib/store");
    vi.resetModules();
    const b = await import("@/lib/store");
    expect(a).not.toBe(b);

    expect(await a.listProducts("u")).toEqual([]); // a has now loaded the (empty) database
    await b.createProduct("u", brief);
    expect((await a.listProducts("u")).map((p) => p.name)).toEqual(["Acme"]);

    await a.createProduct("u", { ...brief, name: "Second" });
    expect((await b.listProducts("u")).map((p) => p.name).sort()).toEqual(["Acme", "Second"]);
  });

  it("picks up changes another process made to the file", async () => {
    expect(await listProducts("u")).toEqual([]);
    const external = { ...brief, id: "x", ownerId: "u", createdAt: "2026-01-01", updatedAt: "2026-01-01", strategy: null, strategyGeneratedAt: null };
    await new Promise((resolve) => setTimeout(resolve, 20)); // make sure the mtime moves
    await writeFile(path.join(dir, "db.json"), JSON.stringify({ products: [external] }));
    expect((await listProducts("u")).map((p) => p.id)).toEqual(["x"]);
  });
});
