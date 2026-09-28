import { z } from "zod";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const Credentials = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
export type Credentials = z.infer<typeof Credentials>;

/** A signed-in user as the app sees them (never includes the password hash). */
export type User = { id: string; email: string; createdAt: string };

// ---------------------------------------------------------------------------
// Product brief: what the user tells us about the thing they want to sell.
// ---------------------------------------------------------------------------

const productFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  oneLiner: z.string().trim().min(1, "One-liner is required").max(280),
  description: z.string().trim().min(1, "Description is required").max(6000),
  website: z.string().trim().max(500),
  pricing: z.string().trim().max(500),
  targetCustomers: z.string().trim().max(2000),
  differentiators: z.string().trim().max(2000),
};

export const ProductInput = z.object({
  ...productFields,
  website: productFields.website.default(""),
  pricing: productFields.pricing.default(""),
  targetCustomers: productFields.targetCustomers.default(""),
  differentiators: productFields.differentiators.default(""),
});
export type ProductInput = z.infer<typeof ProductInput>;

/** Partial update: fields the client omits stay absent (no defaults), so they aren't overwritten. */
export const ProductPatch = z.object(productFields).partial();

// ---------------------------------------------------------------------------
// Go-to-market strategy Claude generates from the brief.
// Used as a structured output schema, so keep it to features structured
// outputs support (no recursion, no numeric/string length constraints).
// ---------------------------------------------------------------------------

export const Strategy = z.object({
  positioning: z.string().describe("One or two sentences: who it is for, the problem, why it wins."),
  valueProps: z.array(z.string()).describe("3-6 concrete benefits, in the buyer's language."),
  personas: z
    .array(
      z.object({
        name: z.string().describe("Short persona label, e.g. 'Solo Shopify store owner'."),
        description: z.string(),
        pains: z.array(z.string()),
        whereTheyHangOut: z
          .array(z.string())
          .describe("Specific communities: subreddits, forums, hashtags, Slack/Discord groups, newsletters."),
      }),
    )
    .describe("2-4 ideal customer personas."),
  buyingSignals: z
    .array(z.string())
    .describe(
      "Phrases or situations that show someone is actively looking to buy, e.g. 'any recommendations for X', 'alternative to Y', 'frustrated with Z'.",
    ),
  searchQueries: z
    .array(
      z.object({
        query: z.string().describe("A web search query that surfaces people publicly asking for a solution."),
        platform: z.string().describe("Where it targets, e.g. Reddit, Hacker News, X, Indie Hackers, Quora, LinkedIn, forums."),
        rationale: z.string(),
      }),
    )
    .describe("8-15 high-intent search queries, using operators like site: and quoted phrases."),
  channels: z
    .array(
      z.object({
        name: z.string(),
        why: z.string(),
        tactic: z.string().describe("The concrete play to run on this channel."),
      }),
    )
    .describe("3-6 marketing channels ranked by expected ROI."),
  objections: z
    .array(z.object({ objection: z.string(), response: z.string() }))
    .describe("Likely buyer objections and how to answer them honestly."),
});
export type Strategy = z.infer<typeof Strategy>;

export type Product = ProductInput & {
  id: string;
  /** The user who owns this product; only they can see it and its leads. */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  strategy: Strategy | null;
  strategyGeneratedAt: string | null;
};

// ---------------------------------------------------------------------------
// Leads: real people, found on the public web, showing intent to buy.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ["new", "contacted", "replied", "won", "lost", "dismissed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const INTENT_LEVELS = ["high", "medium", "low"] as const;
export type IntentLevel = (typeof INTENT_LEVELS)[number];

/** What Claude submits through the `save_lead` tool. Validated before we store it. */
export const LeadCandidate = z.object({
  source_url: z
    .string()
    .regex(/^https?:\/\//i, "must be an http(s) URL")
    .describe("Exact URL of the post, comment or thread where the person expressed the need."),
  platform: z.string().min(1).describe("Reddit, Hacker News, X, LinkedIn, Indie Hackers, Quora, Stack Overflow, a forum name, etc."),
  title: z.string().min(1).describe("Thread or post title (or a short summary if there is none)."),
  author: z
    .string()
    .describe("The person's PUBLIC handle or display name exactly as shown on the post. Empty string if not visible."),
  excerpt: z.string().min(1).describe("A short verbatim quote (1-3 sentences) showing the need or buying intent."),
  posted_at: z.string().describe("When it was posted, as shown (ISO date or relative like '3 days ago'). Empty string if unknown."),
  intent: z.enum(INTENT_LEVELS).describe("high = actively asking for a solution/recommendation now; medium = clear pain, open to solutions; low = adjacent interest."),
  intent_score: z.number().int().min(0).max(100).describe("0-100 likelihood this person would buy the product soon."),
  why_fit: z.string().min(1).describe("Why this person is a fit for this specific product."),
  suggested_angle: z.string().min(1).describe("The most helpful, non-spammy way to engage them."),
});
export type LeadCandidate = z.infer<typeof LeadCandidate>;

export const Outreach = z.object({
  channel: z
    .string()
    .describe("How to reach them, e.g. 'Reply in the Reddit thread', 'Reply on X', 'LinkedIn DM', 'Email'."),
  subject: z.string().describe("Subject line if the channel uses one (email/DM with subject), otherwise empty string."),
  message: z.string().describe("The ready-to-send first message."),
  followUp: z.string().describe("A short, polite follow-up to send if there is no response after a few days."),
  tips: z.array(z.string()).describe("2-4 short tips for sending this well (community rules, timing, disclosure)."),
});
export type Outreach = z.infer<typeof Outreach>;

export type Lead = {
  id: string;
  productId: string;
  createdAt: string;
  sourceUrl: string;
  platform: string;
  title: string;
  author: string;
  excerpt: string;
  postedAt: string;
  intent: IntentLevel;
  intentScore: number;
  whyFit: string;
  suggestedAngle: string;
  status: LeadStatus;
  notes: string;
  outreach: (Outreach & { generatedAt: string }) | null;
};

// ---------------------------------------------------------------------------
// Marketing content Claude writes for the product.
// ---------------------------------------------------------------------------

export const CONTENT_KINDS = {
  launch_posts: "Launch posts (Reddit, Hacker News, Product Hunt, Indie Hackers)",
  social_posts: "Social posts (X / LinkedIn / Threads)",
  cold_email_sequence: "Cold email sequence",
  landing_page: "Landing page copy",
  blog_ideas: "SEO blog post ideas + outlines",
} as const;
export type ContentKind = keyof typeof CONTENT_KINDS;
export const ContentKindSchema = z.enum(Object.keys(CONTENT_KINDS) as [ContentKind, ...ContentKind[]]);

export const ContentPack = z.object({
  assets: z.array(
    z.object({
      title: z.string().describe("Short label for this asset, e.g. 'r/SaaS launch post' or 'Email 2 - follow-up'."),
      channel: z.string().describe("Where this is meant to be published or sent."),
      body: z.string().describe("The full, ready-to-use copy. Use plain text / markdown."),
      notes: z.string().describe("One or two lines on when/how to use it. Empty string if nothing to add."),
    }),
  ),
});
export type ContentPack = z.infer<typeof ContentPack>;

export type ContentAsset = ContentPack["assets"][number] & {
  id: string;
  productId: string;
  kind: ContentKind;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Events streamed to the browser while Claude prospects.
// ---------------------------------------------------------------------------

export type ProspectEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "fetch"; url: string }
  | { type: "note"; text: string }
  | { type: "lead"; lead: Lead }
  | { type: "rejected"; url: string; reason: string }
  | { type: "outreach"; leadId: string; outreach: NonNullable<Lead["outreach"]> }
  | { type: "done"; leadsFound: number; searches: number; summary: string }
  | { type: "error"; message: string };
