import { NextResponse } from "next/server";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { clientIp, RateLimiter } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/http";
import { findUserByEmail } from "@/lib/store";
import { Credentials } from "@/lib/types";

// Per email+IP, so one attacker can't lock a real user out from elsewhere.
const limiter = new RateLimiter(10, 15 * 60 * 1000);

/** Signs a user in with email and password. */
export async function POST(request: Request) {
  const body = await parseBody(request, Credentials);
  if ("response" in body) return jsonError("Invalid email or password.", 401);
  const { email, password } = body.data;

  const key = `${clientIp(request)}|${email}`;
  if (!limiter.attempt(key)) return jsonError("Too many sign-in attempts. Try again in 15 minutes.", 429);

  const user = await findUserByEmail(email);
  // Check a dummy hash for unknown emails so timing doesn't reveal which accounts exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !valid) return jsonError("Invalid email or password.", 401);

  limiter.reset(key);
  await startSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
}
