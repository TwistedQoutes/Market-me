import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, findSessionUser } from "../store";
import type { User } from "../types";
import { SESSION_COOKIE } from "./constants";

/**
 * Cookie sessions. The browser holds a random 256-bit token in an httpOnly
 * cookie; the datastore only keeps its SHA-256, so a leaked data file can't
 * be used to sign in.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** SHA-256 of a session token, as stored in the datastore. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Signs the user in: stores a new session and sets its cookie. Route handlers only. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await createSession(userId, hashToken(token), expires);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

/** The signed-in user for the current request, or null. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findSessionUser(hashToken(token)) : null;
}

/** The signed-in user for a page, redirecting to the sign-in page (then back to `next`) if there is none. */
export async function requirePageUser(next: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Signs out: deletes the session and clears its cookie. Route handlers only. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}
