import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentAsset, Lead, Product, ProductInput, Strategy, User } from "./types";
import { normalizeUrl } from "./urls";

/**
 * A deliberately small JSON-file datastore so the app runs with zero setup.
 * All access goes through this module, so swapping in Postgres/SQLite later
 * only means reimplementing these functions.
 */

/** A stored user; the password hash never leaves this module and the auth code. */
export type UserRecord = User & { passwordHash: string };

/** A signed-in browser session. Only a hash of the cookie token is stored. */
type SessionRecord = { tokenHash: string; userId: string; createdAt: string; expiresAt: string };

type DB = {
  users: UserRecord[];
  sessions: SessionRecord[];
  products: Product[];
  leads: Lead[];
  assets: ContentAsset[];
};

const EMPTY: DB = { users: [], sessions: [], products: [], leads: [], assets: [] };

/** Path of the JSON datastore, honouring MARKETME_DATA_DIR. */
function dataFile(): string {
  const dir = process.env.MARKETME_DATA_DIR ?? path.join(process.cwd(), ".data");
  return path.join(dir, "db.json");
}

type StoreState = {
  /** The in-memory database, with the file's mtime when it was loaded or last written. */
  cache: { file: string; mtimeMs: number; db: DB } | null;
  /** Serialises every read-modify-write so concurrent requests can't clobber each other. */
  queue: Promise<unknown>;
};

// Next.js bundles this module more than once (pages and route handlers get
// separate copies), so the cache and queue live on globalThis. Every copy in
// the process must share one database, or one copy's writes would overwrite
// another's and pages would read stale data.
const state: StoreState = ((globalThis as { __marketmeStore?: StoreState }).__marketmeStore ??= {
  cache: null,
  queue: Promise.resolve(),
});

/** The data file's modification time, or 0 if it doesn't exist yet. */
async function mtimeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).mtimeMs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
}

/** Returns the in-memory database, (re)reading it from disk when the file has changed. */
async function load(): Promise<DB> {
  const file = dataFile();
  const mtimeMs = await mtimeOf(file);
  if (state.cache?.file === file && state.cache.mtimeMs === mtimeMs) return state.cache.db;
  const db: DB = mtimeMs
    ? { ...structuredClone(EMPTY), ...JSON.parse(await readFile(file, "utf8")) }
    : structuredClone(EMPTY);
  state.cache = { file, mtimeMs, db };
  return db;
}

/** Writes the database to disk atomically (temp file, then rename). */
async function persist(db: DB): Promise<void> {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, file);
  // Record our own write so the next load doesn't re-read the file for nothing.
  if (state.cache?.file === file) state.cache.mtimeMs = await mtimeOf(file);
}

/** Runs a read-only query in the serialised queue. */
function read<T>(fn: (db: DB) => T): Promise<T> {
  const run = state.queue.then(async () => fn(await load()));
  state.queue = run.catch(() => undefined);
  return run;
}

/** Runs a change in the serialised queue and saves the result to disk. */
function write<T>(fn: (db: DB) => T): Promise<T> {
  const run = state.queue.then(async () => {
    const db = await load();
    const result = fn(db);
    try {
      await persist(db);
    } catch (err) {
      // fn mutated the cached copy in place; drop it so reads don't see unsaved changes.
      state.cache = null;
      throw err;
    }
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

/** Test helper: forget the in-memory copy so the next call re-reads from disk. */
export function resetStoreCache(): void {
  state.cache = null;
}

/** Current time as an ISO 8601 string. */
const now = () => new Date().toISOString();

// --- Users & sessions -------------------------------------------------------

/** Number of registered users. */
export function countUsers(): Promise<number> {
  return read((db) => db.users.length);
}

/** The stored user with this (lower-cased) email, including the password hash, or null. */
export function findUserByEmail(email: string): Promise<UserRecord | null> {
  return read((db) => db.users.find((u) => u.email === email) ?? null);
}

/**
 * Registers a user; null if the email is taken. The first account also takes
 * ownership of any products created before accounts existed.
 */
export function createUser(email: string, passwordHash: string): Promise<User | null> {
  return write((db) => {
    if (db.users.some((u) => u.email === email)) return null;
    const user: UserRecord = { id: randomUUID(), email, passwordHash, createdAt: now() };
    if (db.users.length === 0) {
      for (const product of db.products) product.ownerId ??= user.id;
    }
    db.users.push(user);
    return publicUser(user);
  });
}

/** Strips the password hash from a stored user. */
function publicUser({ id, email, createdAt }: UserRecord): User {
  return { id, email, createdAt };
}

/** Stores a new session and drops any that have expired. */
export function createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  return write((db) => {
    const current = now();
    db.sessions = db.sessions.filter((s) => s.expiresAt > current);
    db.sessions.push({ tokenHash, userId, createdAt: current, expiresAt: expiresAt.toISOString() });
  });
}

/** The user a live session belongs to, or null if the session is unknown or expired. */
export function findSessionUser(tokenHash: string): Promise<User | null> {
  return read((db) => {
    const session = db.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session || session.expiresAt <= now()) return null;
    const user = db.users.find((u) => u.id === session.userId);
    return user ? publicUser(user) : null;
  });
}

/** Ends a session (sign-out). */
export function deleteSession(tokenHash: string): Promise<void> {
  return write((db) => {
    db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
  });
}

// --- Products ---------------------------------------------------------------

/** The products a user owns, newest first. */
export function listProducts(ownerId: string): Promise<Product[]> {
  return read((db) =>
    db.products.filter((p) => p.ownerId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

/** One of the user's products, or null if it doesn't exist or belongs to someone else. */
export function getProduct(ownerId: string, id: string): Promise<Product | null> {
  return read((db) => findOwned(db, ownerId, id));
}

/** Looks up a product only if it belongs to the given user. */
function findOwned(db: DB, ownerId: string, id: string): Product | null {
  return db.products.find((p) => p.id === id && p.ownerId === ownerId) ?? null;
}

/** Creates a product for the user, with no strategy yet. */
export function createProduct(ownerId: string, input: ProductInput): Promise<Product> {
  return write((db) => {
    const product: Product = {
      ...input,
      id: randomUUID(),
      ownerId,
      createdAt: now(),
      updatedAt: now(),
      strategy: null,
      strategyGeneratedAt: null,
    };
    db.products.push(product);
    return product;
  });
}

/** Applies a partial update to one of the user's product briefs; null if not found. */
export function updateProduct(ownerId: string, id: string, patch: Partial<ProductInput>): Promise<Product | null> {
  return write((db) => {
    const product = findOwned(db, ownerId, id);
    if (!product) return null;
    Object.assign(product, patch, { updatedAt: now() });
    return product;
  });
}

/** Stores a generated strategy on one of the user's products; null if not found. */
export function saveStrategy(ownerId: string, id: string, strategy: Strategy): Promise<Product | null> {
  return write((db) => {
    const product = findOwned(db, ownerId, id);
    if (!product) return null;
    product.strategy = strategy;
    product.strategyGeneratedAt = now();
    product.updatedAt = now();
    return product;
  });
}

/** Deletes one of the user's products with its leads and assets; false if not found. */
export function deleteProduct(ownerId: string, id: string): Promise<boolean> {
  return write((db) => {
    if (!findOwned(db, ownerId, id)) return false;
    db.products = db.products.filter((p) => p.id !== id);
    db.leads = db.leads.filter((l) => l.productId !== id);
    db.assets = db.assets.filter((a) => a.productId !== id);
    return true;
  });
}

// --- Leads ------------------------------------------------------------------

/** A product's leads, highest intent score first, then newest. */
export function listLeads(productId: string): Promise<Lead[]> {
  return read((db) =>
    db.leads
      .filter((l) => l.productId === productId)
      .sort((a, b) => b.intentScore - a.intentScore || b.createdAt.localeCompare(a.createdAt)),
  );
}

/** One lead of a product, or null. */
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

/** Updates a lead's status, notes or outreach; null if not found. */
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

/** Deletes one lead; false if not found. */
export function deleteLead(productId: string, leadId: string): Promise<boolean> {
  return write((db) => {
    const before = db.leads.length;
    db.leads = db.leads.filter((l) => !(l.productId === productId && l.id === leadId));
    return db.leads.length < before;
  });
}

// --- Content assets ---------------------------------------------------------

/** A product's content assets, newest first. */
export function listAssets(productId: string): Promise<ContentAsset[]> {
  return read((db) =>
    db.assets.filter((a) => a.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

/** Stores newly generated content assets. */
export function addAssets(assets: Omit<ContentAsset, "id" | "createdAt">[]): Promise<ContentAsset[]> {
  return write((db) => {
    const created = assets.map((a) => ({ ...a, id: randomUUID(), createdAt: now() }));
    db.assets.push(...created);
    return created;
  });
}

/** Deletes one content asset; false if not found. */
export function deleteAsset(productId: string, assetId: string): Promise<boolean> {
  return write((db) => {
    const before = db.assets.length;
    db.assets = db.assets.filter((a) => !(a.productId === productId && a.id === assetId));
    return db.assets.length < before;
  });
}
