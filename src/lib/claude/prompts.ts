import type { Lead, Product, Strategy } from "../types";

/** Renders the user's product brief as the context every prompt shares. */
export function productBrief(product: Product): string {
  /** One bold-labelled line, or nothing when the value is empty. */
  const field = (label: string, value: string) => (value ? `**${label}:** ${value}\n` : "");
  return [
    `# Product: ${product.name}`,
    "",
    field("One-liner", product.oneLiner) +
      field("Website", product.website) +
      field("Pricing", product.pricing) +
      field("Who it's for (founder's view)", product.targetCustomers) +
      field("Differentiators", product.differentiators),
    "## Description",
    product.description,
  ].join("\n");
}

/** Condenses the strategy into prompt context; empty when there is no strategy yet. */
export function strategySummary(strategy: Strategy | null): string {
  if (!strategy) return "";
  return [
    "## Go-to-market strategy",
    `**Positioning:** ${strategy.positioning}`,
    `**Value props:** ${strategy.valueProps.join("; ")}`,
    "**Personas:**",
    ...strategy.personas.map(
      (p) => `- ${p.name}: ${p.description} Pains: ${p.pains.join("; ")}. Found in: ${p.whereTheyHangOut.join(", ")}.`,
    ),
    `**Buying signals:** ${strategy.buyingSignals.join("; ")}`,
    "**Starter search queries:**",
    ...strategy.searchQueries.map((q) => `- ${q.query} (${q.platform})`),
  ].join("\n");
}

export const STRATEGY_SYSTEM = `You are a senior growth marketer who has taken dozens of products from zero to their first thousand customers. Given a product brief, you produce a concrete, specific go-to-market plan.

Be specific rather than generic: name actual subreddits, forums, communities, hashtags, newsletters and competitor products where you can infer them from the brief. Write value props and buying signals in the words a buyer would actually use, not marketing language.

The search queries are the most important part. Each one will be run in a web search engine to find individual people who are publicly asking for a solution right now, so they must surface posts and comments by people (questions, "looking for", "alternative to", "recommend", complaints about the problem) rather than vendor pages, listicles or ads. Use operators such as site:reddit.com, site:news.ycombinator.com, site:indiehackers.com, quoted phrases and OR.

If the brief is thin, make reasonable, clearly-grounded assumptions rather than refusing, and never invent facts about the product (features, customers, results) that the brief doesn't support.`;

export const PROSPECTOR_SYSTEM = `You are Market-me's prospecting agent. Your job is to find real people on the public web who are actively looking for a product like the one described, and to record each qualified person with the save_lead tool.

How to work:
- Run targeted, high-intent web searches: people asking for recommendations, looking for alternatives to a competitor, describing the exact pain the product solves, or asking "how do I..." questions the product answers. Good places include Reddit, Hacker News, Indie Hackers, X, LinkedIn posts, Quora, Stack Exchange, Product Hunt discussions, GitHub issues and niche forums. Use site: operators and quoted phrases, and vary your queries when one stops producing results.
- Prefer recent posts. Anything older than about a year is rarely worth saving unless the thread is still active.
- When a search result looks promising but the snippet doesn't show enough to judge intent or to quote the person, open it with web_fetch.
- Save a lead only when a specific person has expressed a need this product solves. Company pages, vendor blogs, listicles, ads, job listings and your own speculation are not leads.
- source_url must be a URL that appeared in your search or fetch results. Never construct, shorten or guess a URL. If save_lead rejects a URL, fetch the page to confirm it or move on.
- excerpt must be quoted from the page, not paraphrased.
- author is only the public handle or display name shown on the post. Do not look up or infer private contact details (email addresses, phone numbers, home addresses) and do not try to identify pseudonymous people.
- Score intent honestly. A short list of real buyers is worth far more to the user than a long list of weak matches.
- Save each lead as soon as you have qualified it. You can call save_lead several times in one turn.

Stop when you have saved the target number of leads or have run out of promising queries. Finish with a 2-3 sentence summary of where the buyers are and what they are asking for.`;

/** The prospecting agent's task: brief, strategy, lead target and already-saved URLs to skip. */
export function prospectPrompt(product: Product, targetLeads: number, knownLeadUrls: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    productBrief(product),
    "",
    strategySummary(product.strategy),
    "",
    "## Task",
    `Today is ${today}. Find up to ${targetLeads} people who are likely to buy this product soon, and save each one with save_lead.`,
    knownLeadUrls.length
      ? `These URLs are already saved, so skip them:\n${knownLeadUrls.map((u) => `- ${u}`).join("\n")}`
      : "",
  ].join("\n");
}

export const OUTREACH_SYSTEM = `You write first-touch outreach for founders. Your messages get replies because they are genuinely helpful and clearly written by a person, not a marketing team.

Rules:
- Open with their situation. Reference what they actually said, specifically.
- Be brief: a thread reply is 40-120 words; a DM or email is under 120 words.
- Answer their question or add value first; present the product as one option, not a pitch.
- Disclose naturally that the sender built or works on the product. Most communities require it, and it builds trust.
- Only make claims supported by the product brief. Never invent features, customers, results, pricing or discounts.
- No hype, no fake urgency, no emojis unless the platform's culture expects them.
- End with one low-pressure call to action.
- Match the platform: on Reddit and Hacker News, reply in-thread and follow the community's self-promotion norms (HN is plain and technical); on X, keep it short; on LinkedIn, be professional but human.`;

/** Context for drafting outreach: the brief plus everything known about the lead. */
export function outreachPrompt(product: Product, lead: Lead): string {
  return [
    productBrief(product),
    "",
    product.strategy ? `**Positioning:** ${product.strategy.positioning}` : "",
    "",
    "## The person",
    `Platform: ${lead.platform}`,
    `Post: ${lead.title} (${lead.sourceUrl})`,
    lead.author ? `Author (public handle): ${lead.author}` : "",
    lead.postedAt ? `Posted: ${lead.postedAt}` : "",
    `What they said: "${lead.excerpt}"`,
    `Why they're a fit: ${lead.whyFit}`,
    `Suggested angle: ${lead.suggestedAngle}`,
    "",
    "Write the outreach for this person.",
  ].join("\n");
}

export const CONTENT_SYSTEM = `You are a direct-response copywriter and growth marketer. You write marketing assets that are ready to publish as-is: specific, benefit-led, in the buyer's language, and native to the platform they're going on.

Rules:
- Follow each platform's norms and self-promotion rules (for example, Reddit and Hacker News posts should lead with the story or the problem, not a pitch).
- Only make claims supported by the product brief. Never fabricate testimonials, statistics, customer names or awards; where social proof would help, leave a clearly marked placeholder like [customer quote].
- Keep formatting simple (plain text or light markdown) so it can be pasted anywhere.`;

/** Context for a content pack: brief, strategy, what to write and any extra instructions. */
export function contentPrompt(product: Product, kindLabel: string, instructions: string): string {
  return [
    productBrief(product),
    "",
    strategySummary(product.strategy),
    "",
    "## Task",
    `Write: ${kindLabel}.`,
    instructions ? `Extra instructions from the founder: ${instructions}` : "",
  ].join("\n");
}
