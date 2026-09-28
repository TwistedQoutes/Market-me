import { NextResponse } from "next/server";
import type { z } from "zod";
import { describeClaudeError } from "./claude/client";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export const notFound = (what = "Not found") => jsonError(what, 404);

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
