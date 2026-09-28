import { Outreach, type Lead, type Product } from "../types";
import { OUTREACH_SYSTEM, outreachPrompt } from "./prompts";
import { generateStructured } from "./structured";

export function draftOutreach(product: Product, lead: Lead, signal?: AbortSignal): Promise<Outreach> {
  return generateStructured({
    schema: Outreach,
    system: OUTREACH_SYSTEM,
    prompt: outreachPrompt(product, lead),
    signal,
  });
}
