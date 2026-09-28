import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentAsset, Lead, Product, ProductInput, Strategy } from "./types";
import { normalizeUrl } from "./urls";

/**
 * A deliberately small JSON-file datastore so the app runs with zero setup.
 * All access goes through this module, so swapping in Postgres/SQLite later
 * only means reimplementing these functions.
 */

type DB = {
  products: Product[];
  leads: Lead[];
  assets: ContentAsset[];
};

const EMPTY: DB = { products: [], leads: [], assets: [] };

function dataFile(): string {
  const dir = process.env.MARKETME_DATA_DIR ?? path.join(process.cwd(), ".data");
  return path.join(dir, "db.json");
}

let cache: { file: string; db: DB } | null = null;
// Serialises every read-modify-write so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DB> {
  const file = dataFile();
  if (cache?.file === file) return cache.db;
  let db: DB;
  try {
    db = { ...structuredClone(EMPTY), ...JSON.parse(await readFile(file, "utf8")) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    db = structuredClone(EMPTY);
  }
  cache = { file, db };
  return db;
}

async function persist(db: DB): Promise<void> {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, file);
}

function read<T>(fn: (db: DB) => T): Promise<T> {
  const run = queue.then(async () => fn(await load()));
  queue = run.catch(() => undefined);
  return run;
}

function write<T>(fn: (db: DB) => T): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = fn(db);
    try {
      await persist(db);
    } catch (err) {
      // fn mutated the cached copy in place; drop it so reads don't see unsaved changes.
      cache = null;
      throw err;
    }
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Test helper: forget the in-memory copy so the next call re-reads from disk. */
export function resetStoreCache(): void {
  cache = null;
}

const now = () => new Date().toISOString();

// --- Products ---------------------------------------------------------------

export function listProducts(): Promise<Product[]> {
  return read((db) => [...db.products].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function getProduct(id: string): Promise<Product | null> {
  return read((db) => db.products.find((p) => p.id === id) ?? null);
}

export function createProduct(input: ProductInput): Promise<Product> {
  return write((db) => {
    const product: Product = {
      ...input,
      id: randomUUID(),
      createdAt: now(),
      updatedAt: now(),
      strategy: null,
      strategyGeneratedAt: null,
    };
    db.products.push(product);
    return product;
  });
}

export function updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product | null> {
  return write((db) => {
    const product = db.products.find((p) => p.id === id);
    if (!product) return null;
    Object.assign(product, patch, { updatedAt: now() });
    return product;
  });
}

export function saveStrategy(id: string, strategy: Strategy): Promise<Product | null> {
  return write((db) => {
    const product = db.products.find((p) => p.id === id);
    if (!product) return null;
    product.strategy = strategy;
    product.strategyGeneratedAt = now();
    product.updatedAt = now();
    return product;
  });
}

export function deleteProduct(id: string): Promise<boolean> {
  return write((db) => {
    const before = db.products.length;
    db.products = db.products.filter((p) => p.id !== id);
    db.leads = db.leads.filter((l) => l.productId !== id);
    db.assets = db.assets.filter((a) => a.productId !== id);
    return db.products.length < before;
  });
}

// --- Leads ------------------------------------------------------------------

export function listLeads(productId: string): Promise<Lead[]> {
  return read((db) =>
    db.leads
      .filter((l) => l.productId === productId)
      .sort((a, b) => b.intentScore - a.intentScore || b.createdAt.localeCompare(a.createdAt)),
  );
}

export function getLead(productId: string, leadId: string): Promise<Lead | null> {
  return read((db) => db.leads.find((l) => l.productId === productId && l.id === leadId) ?? null);
}

export type NewLead = Omit<Lead, "id" | "createdAt" | "status" | "notes" | "outreach">;

/** Adds a lead unless one with the same (normalised) URL already exists for the product. */
export function addLead(input: NewLead): Promise<{ lead: Lead; duplicate: boolean }> {
  return write((db) => {
    const key = normalizeUrl(input.sourceUrl);
    const existing = db.leads.find((l) => l.productId === input.productId && normalizeUrl(l.sourceUrl) === key);
    if (existing) return { lead: existing, duplicate: true };
    const lead: Lead = { ...input, id: randomUUID(), createdAt: now(), status: "new", notes: "", outreach: null };
    db.leads.push(lead);
    return { lead, duplicate: false };
  });
}

export function updateLead(
  productId: string,
  leadId: string,
  patch: Partial<Pick<Lead, "status" | "notes" | "outreach">>,
): Promise<Lead | null> {
  return write((db) => {
    const lead = db.leads.find((l) => l.productId === productId && l.id === leadId);
    if (!lead) return null;
    Object.assign(lead, patch);
    return lead;
  });
}

export function deleteLead(productId: string, leadId: string): Promise<boolean> {
  return write((db) => {
    const before = db.leads.length;
    db.leads = db.leads.filter((l) => !(l.productId === productId && l.id === leadId));
    return db.leads.length < before;
  });
}

// --- Content assets ---------------------------------------------------------

export function listAssets(productId: string): Promise<ContentAsset[]> {
  return read((db) =>
    db.assets.filter((a) => a.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export function addAssets(assets: Omit<ContentAsset, "id" | "createdAt">[]): Promise<ContentAsset[]> {
  return write((db) => {
    const created = assets.map((a) => ({ ...a, id: randomUUID(), createdAt: now() }));
    db.assets.push(...created);
    return created;
  });
}

export function deleteAsset(productId: string, assetId: string): Promise<boolean> {
  return write((db) => {
    const before = db.assets.length;
    db.assets = db.assets.filter((a) => !(a.productId === productId && a.id === assetId));
    return db.assets.length < before;
  });
}
