import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { canSignUp } from "@/lib/auth/policy";
import { clientIp, RateLimiter } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/http";
import { countUsers, createUser } from "@/lib/store";
import { Credentials } from "@/lib/types";

const limiter = new RateLimiter(10, 60 * 60 * 1000);

/** Creates an account (subject to the sign-up policy) and signs the new user in. */
export async function POST(request: Request) {
  if (!limiter.attempt(clientIp(request))) return jsonError("Too many sign-up attempts. Try again later.", 429);
  const body = await parseBody(request, Credentials);
  if ("response" in body) return body.response;
  const { email, password } = body.data;

  if (!canSignUp(email, await countUsers())) {
    return jsonError("Sign-ups are closed. Ask the owner of this Market-me instance to invite your email.", 403);
  }
  const user = await createUser(email, await hashPassword(password));
  if (!user) return jsonError("An account with this email already exists. Sign in instead.", 409);
  await startSession(user.id);
  return NextResponse.json({ user }, { status: 201 });
}
