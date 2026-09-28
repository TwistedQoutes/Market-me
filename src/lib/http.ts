import { NextResponse } from "next/server";
import type { z } from "zod";
import { currentUser } from "./auth/session";
import { describeClaudeError } from "./claude/client";
import { getProduct } from "./store";
import type { Product, User } from "./types";

/** JSON error response shaped `{ error: message }` with the given status. */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** 404 JSON error response. */
export const notFound = (what = "Not found") => jsonError(what, 404);

/** The signed-in user, or a 401 response to return when nobody is signed in. */
export async function requireUser(): Promise<{ user: User } | { response: NextResponse }> {
  const user = await currentUser();
  return user ? { user } : { response: jsonError("Sign in to continue.", 401) };
}

/** The signed-in user and one of their products, or the 401/404 response to return instead. */
export async function requireProduct(id: string): Promise<{ user: User; product: Product } | { response: NextResponse }> {
  const auth = await requireUser();
  if ("response" in auth) return auth;
  const product = await getProduct(auth.user.id, id);
  return product ? { user: auth.user, product } : { response: notFound("Product not found") };
}

/** Parses a JSON request body against a schema, returning a 400 response on failure. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError("Request body must be JSON.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { response: jsonError(`${issue.path.join(".") || "body"}: ${issue.message}`, 400) };
  }
  return { data: parsed.data };
}

/** Wraps a Claude-backed handler so failures come back as readable JSON errors. */
export async function withClaudeErrors(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    return jsonError(describeClaudeError(err), 502);
  }
}
