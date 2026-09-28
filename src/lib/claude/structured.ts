import type { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { baseParams, claude, RefusalError } from "./client";

/**
 * One Claude call whose answer is validated against a Zod schema
 * (structured outputs), used for strategy, outreach and content generation.
 * Streamed so long answers (e.g. a full content pack) never hit HTTP timeouts.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<z.infer<T>> {
  const stream = claude().beta.messages.stream(
    {
      ...baseParams(),
      max_tokens: opts.maxTokens ?? 64000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: betaZodOutputFormat(opts.schema) },
    },
    { signal: opts.signal },
  );
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's answer was cut off (max_tokens). Try asking for less at once.");
  }
  if (response.parsed_output == null) throw new Error("Claude returned an answer that didn't match the expected format.");
  return response.parsed_output as z.infer<T>;
}
