import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Claude configuration. Every call in the app goes through the beta
 * Messages endpoint so it can opt into server-side refusal fallbacks: if a
 * request is declined by a safety classifier, the API transparently re-runs
 * it on Anthropic's recommended fallback model instead of failing.
 */

export const MODEL = process.env.MARKETME_MODEL || "claude-opus-5";

let client: Anthropic | null = null;

/** The shared Anthropic client, created on first use. */
export function claude(): Anthropic {
  // Lazily constructed so a missing key surfaces as a request error, not a build failure.
  client ??= new Anthropic();
  return client;
}

/** Request fields shared by every call. */
export function baseParams() {
  return {
    model: MODEL,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
  } satisfies Partial<Anthropic.Beta.Messages.MessageCreateParams>;
}

/** Turns SDK errors into a message that is safe and useful to show in the UI. */
export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Claude rejected the API key. Set a valid ANTHROPIC_API_KEY in your environment and restart.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Claude rate limit reached. Wait a minute and try again.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Claude API. Check your network connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "unknown"}): ${err.message}`;
  if (err instanceof Error && /api key|apiKey|authToken/i.test(err.message)) {
    return "No Anthropic API key found. Copy .env.example to .env.local and set ANTHROPIC_API_KEY.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** Thrown when Claude (and its fallback model) declines a request. */
export class RefusalError extends Error {
  constructor(category: string | null | undefined) {
    super(
      `Claude declined this request${category ? ` (${category})` : ""}. Try rephrasing the product description.`,
    );
  }
}
