import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt from Node's standard library, so there is no
 * native dependency to install. Hashes are self-describing
 * (`scrypt$N$r$p$salt$hash`) so the cost can be raised later without
 * breaking existing accounts.
 */

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

/** scrypt as a promise. */
function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Hashes a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/** Checks a password against a stored hash in constant time. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * A real hash of a random password, checked when an email isn't registered so
 * a failed login takes the same time whether or not the account exists.
 */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
