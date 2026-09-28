import { Outreach, type Lead, type Product } from "../types";
import { OUTREACH_SYSTEM, outreachPrompt } from "./prompts";
import { generateStructured } from "./structured";

/** Drafts a first message, a follow-up and sending tips for one lead. */
export function draftOutreach(product: Product, lead: Lead, signal?: AbortSignal): Promise<Outreach> {
  return generateStructured({
    schema: Outreach,
    system: OUTREACH_SYSTEM,
    prompt: outreachPrompt(product, lead),
    signal,
  });
}
