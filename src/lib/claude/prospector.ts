import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addLead, listLeads, updateLead } from "../store";
import { LeadCandidate, type Lead, type Product, type ProspectEvent } from "../types";
import { collectRetrievedUrls, isKnownUrl } from "../urls";
import { baseParams, claude, RefusalError } from "./client";
import { draftOutreach } from "./outreach";
import { PROSPECTOR_SYSTEM, prospectPrompt } from "./prompts";

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Upper bound on model round-trips per run, which also bounds cost. */
const MAX_TURNS = 20;
/** Leads at or above this score get outreach drafted automatically in autopilot mode. */
export const AUTO_DRAFT_MIN_SCORE = 70;

const leadInputSchema = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(LeadCandidate) as Record<string, unknown>;
  return schema as Anthropic.Beta.Messages.BetaTool.InputSchema;
})();

const TOOLS: Anthropic.Beta.Messages.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 10 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10, max_content_tokens: 20000 },
  {
    name: "save_lead",
    description:
      "Record one qualified prospect: a specific person who publicly expressed a need this product solves. " +
      "Call once per person, as soon as you have qualified them. source_url must come from your search or fetch results.",
    input_schema: leadInputSchema,
    eager_input_streaming: true,
  },
];

export type ProspectOptions = {
  targetLeads: number;
  /** Autopilot: also draft outreach for every high-intent lead found. */
  autoDraft: boolean;
  emit: (event: ProspectEvent) => void;
  signal?: AbortSignal;
  /** Injectable for tests. */
  client?: Anthropic;
};

/**
 * Validates and stores the leads Claude submits via `save_lead`. Every lead
 * must point at a URL that actually came back from web search/fetch in this
 * run, which stops the model from saving invented people or links.
 */
export class LeadRecorder {
  readonly retrievedUrls = new Set<string>();
  readonly saved: Lead[] = [];

  constructor(
    private readonly productId: string,
    private readonly target: number,
    private readonly emit: (event: ProspectEvent) => void,
  ) {}

  get targetReached(): boolean {
    return this.saved.length >= this.target;
  }

  async handle(toolUse: BetaToolUseBlock): Promise<BetaToolResultBlockParam> {
    const result = (content: string, isError = false): BetaToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content,
      ...(isError ? { is_error: true } : {}),
    });

    if (toolUse.name !== "save_lead") return result(`Unknown tool: ${toolUse.name}`, true);

    const parsed = LeadCandidate.safeParse(toolUse.input);
    if (!parsed.success) return result(`Invalid save_lead input:\n${z.prettifyError(parsed.error)}`, true);
    const candidate = parsed.data;

    if (this.targetReached) {
      return result("Target already reached; this lead was not saved. Stop searching and write your summary.", true);
    }

    if (!isKnownUrl(candidate.source_url, this.retrievedUrls)) {
      const reason = "URL did not appear in any search or fetch result";
      this.emit({ type: "rejected", url: candidate.source_url, reason });
      return result(
        `Not saved: ${reason}. Only save URLs you actually retrieved. Open the page with web_fetch to confirm it, or move on.`,
        true,
      );
    }

    const { lead, duplicate } = await addLead({
      productId: this.productId,
      sourceUrl: candidate.source_url,
      platform: candidate.platform,
      title: candidate.title,
      author: candidate.author,
      excerpt: candidate.excerpt,
      postedAt: candidate.posted_at,
      intent: candidate.intent,
      intentScore: candidate.intent_score,
      whyFit: candidate.why_fit,
      suggestedAngle: candidate.suggested_angle,
    });
    if (duplicate) return result("This person is already saved; skip them and find someone new.");

    this.saved.push(lead);
    this.emit({ type: "lead", lead });
    const progress = `Saved (${this.saved.length}/${this.target}).`;
    return result(this.targetReached ? `${progress} Target reached. Stop searching and write your summary.` : progress);
  }
}

/**
 * The prospecting agent: Claude searches the public web (server-side
 * web_search / web_fetch), qualifies people showing buying intent, and records
 * them through our client-side `save_lead` tool. Progress is streamed to the
 * caller through `emit`.
 */
export async function prospect(product: Product, opts: ProspectOptions): Promise<void> {
  const { emit, signal } = opts;
  const anthropic = opts.client ?? claude();
  const recorder = new LeadRecorder(product.id, opts.targetLeads, emit);

  const known = (await listLeads(product.id)).slice(0, 50).map((l) => l.sourceUrl);
  const messages: BetaMessageParam[] = [
    { role: "user", content: prospectPrompt(product, opts.targetLeads, known) },
  ];

  let searches = 0;
  let summary = "";
  let jsonRetries = 0;

  emit({ type: "status", message: `Claude is searching the web for people who need ${product.name}…` });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = anthropic.beta.messages.stream(
      {
        ...baseParams(),
        max_tokens: 64000,
        system: PROSPECTOR_SYSTEM,
        tools: TOOLS,
        messages,
        // Cache the growing conversation so each turn only pays for what's new.
        cache_control: { type: "ephemeral" },
      },
      { signal },
    );

    let responseStarted = false;
    stream.on("streamEvent", () => {
      responseStarted = true;
    });
    stream.on("contentBlock", (block) => {
      if (block.type !== "server_tool_use") return;
      const input = (block.input ?? {}) as { query?: unknown; url?: unknown };
      if (block.name === "web_search" && typeof input.query === "string") {
        searches++;
        emit({ type: "search", query: input.query });
      } else if (block.name === "web_fetch" && typeof input.url === "string") {
        emit({ type: "fetch", url: input.url });
      }
    });

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, a tool input that isn't valid JSON rejects
      // the stream mid-response with a plain AnthropicError. Re-issue that turn
      // a couple of times. The stream wraps every other failure in the same
      // class, so only retry once the response had started: failures before
      // that (missing credentials, network) and API errors are rethrown.
      const garbledToolInput =
        responseStarted && err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError);
      if (!garbledToolInput || signal?.aborted || jsonRetries++ >= 2) throw err;
      emit({ type: "status", message: "Retrying a garbled tool call…" });
      continue;
    }

    collectRetrievedUrls(message.content, recorder.retrievedUrls);

    const text = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (text) {
      summary = text;
      emit({ type: "note", text });
    }

    if (message.stop_reason === "refusal") throw new RefusalError(message.stop_details?.category);

    // Server-side search loop paused mid-turn: send the turn back to resume it.
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break; // end_turn: Claude is done.
    if (message.stop_reason === "max_tokens") throw new Error("A save_lead call was cut off (max_tokens).");

    messages.push({ role: "assistant", content: message.content });
    const results: BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) results.push(await recorder.handle(toolUse));
    messages.push({ role: "user", content: results });
  }

  if (opts.autoDraft) await autoDraft(product, recorder.saved, emit, signal);

  emit({ type: "done", leadsFound: recorder.saved.length, searches, summary });
}

/** Drafts outreach for the strongest new leads, a few at a time. */
async function autoDraft(
  product: Product,
  leads: Lead[],
  emit: (event: ProspectEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const queue = leads.filter((l) => l.intentScore >= AUTO_DRAFT_MIN_SCORE);
  if (queue.length === 0) return;
  emit({ type: "status", message: `Drafting outreach for ${queue.length} high-intent lead(s)…` });

  const worker = async () => {
    for (let lead = queue.shift(); lead; lead = queue.shift()) {
      if (signal?.aborted) return;
      try {
        const outreach = { ...(await draftOutreach(product, lead, signal)), generatedAt: new Date().toISOString() };
        await updateLead(product.id, lead.id, { outreach });
        emit({ type: "outreach", leadId: lead.id, outreach });
      } catch (err) {
        if (signal?.aborted) return;
        emit({ type: "status", message: `Couldn't draft outreach for "${lead.title}": ${(err as Error).message}` });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
