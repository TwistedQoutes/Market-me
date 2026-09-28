import { CONTENT_KINDS, ContentPack, type ContentKind, type Product } from "../types";
import { CONTENT_SYSTEM, contentPrompt } from "./prompts";
import { generateStructured } from "./structured";

const KIND_GUIDANCE: Record<ContentKind, string> = {
  launch_posts:
    "One launch post each for Reddit (name the best-fit subreddit in the title field), Hacker News (Show HN), Product Hunt (tagline + description + maker's first comment) and Indie Hackers.",
  social_posts:
    "Five X posts (at least one thread), three LinkedIn posts and two Threads posts. Mix problem-led, story-led and demo-led angles.",
  cold_email_sequence:
    "A 4-email cold sequence for the primary persona: first touch, value-add follow-up, social-proof/placeholder follow-up, polite break-up. Include subject lines in the body.",
  landing_page:
    "Landing page copy as separate assets: hero (headline, subheadline, CTA), problem section, how it works, features-as-benefits, objection-handling FAQ, final CTA.",
  blog_ideas:
    "Six SEO blog post ideas targeting high-intent searches the personas make. For each: title, target keyword, search intent, and an H2 outline.",
};

/** Writes a pack of ready-to-publish marketing assets of one kind. */
export async function generateContent(
  product: Product,
  kind: ContentKind,
  instructions: string,
  signal?: AbortSignal,
): Promise<ContentPack> {
  return generateStructured({
    schema: ContentPack,
    system: CONTENT_SYSTEM,
    prompt: contentPrompt(product, `${CONTENT_KINDS[kind]}. ${KIND_GUIDANCE[kind]}`, instructions),
    signal,
  });
}
