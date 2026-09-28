import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProduct, getProduct, listProducts, resetStoreCache, updateProduct } from "@/lib/store";
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
    const product = await createProduct(brief);
    const patch = ProductPatch.parse({ name: "Acme 2" });
    expect(patch).toEqual({ name: "Acme 2" });

    await updateProduct(product.id, patch);
    expect(await getProduct(product.id)).toMatchObject({
      name: "Acme 2",
      website: "https://acme.example",
      pricing: "$10/month",
    });
  });
});

describe("failed writes", () => {
  it("don't leave unsaved changes visible in memory", async () => {
    await createProduct(brief);
    // Make the atomic-write temp path a directory so the next persist fails.
    await mkdir(path.join(dir, `db.json.${process.pid}.tmp`));

    await expect(createProduct({ ...brief, name: "Never saved" })).rejects.toThrow();
    expect((await listProducts()).map((p) => p.name)).toEqual(["Acme"]);
  });
});
