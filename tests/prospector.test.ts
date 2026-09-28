import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { prospect } from "@/lib/claude/prospector";
import { createProduct, listLeads, resetStoreCache } from "@/lib/store";
import type { ProspectEvent } from "@/lib/types";

type Block = Record<string, unknown> & { type: string };
/** `error` turns make finalMessage() reject, as the SDK's stream does. */
type Turn = { stop_reason: string; content: Block[] } | { error: Error };

/** A stand-in for the Anthropic client that replays scripted turns. */
function fakeClient(turns: Turn[]) {
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: { messages: { role: string; content: unknown }[] }) {
          requests.push(structuredClone(params));
          const turn = turns.shift();
          if (!turn) throw new Error("unexpected extra request");
          const listeners: ((block: Block) => void)[] = [];
          return {
            on(event: string, fn: (block: Block) => void) {
              if (event === "contentBlock") listeners.push(fn);
              return this;
            },
            async finalMessage() {
              if ("error" in turn) throw turn.error;
              for (const block of turn.content) for (const fn of listeners) fn(block);
              return { ...turn, stop_details: null };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

const newProduct = () =>
  createProduct({
    name: "X",
    oneLiner: "x",
    description: "x",
    website: "",
    pricing: "",
    targetCustomers: "",
    differentiators: "",
  });

const lead = (id: string, url: string, score = 85) => ({
  type: "tool_use",
  id,
  name: "save_lead",
  input: {
    source_url: url,
    platform: "Reddit",
    title: "Looking for an invoicing tool",
    author: "u/freelancer",
    excerpt: "Any recommendations for invoicing software that chases late payers?",
    posted_at: "2 days ago",
    intent: "high",
    intent_score: score,
    why_fit: "Freelancer struggling with late payments",
    suggested_angle: "Share how automatic reminders work",
  },
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marketme-"));
  process.env.MARKETME_DATA_DIR = dir;
  resetStoreCache();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("prospect", () => {
  it("saves verified leads, rejects invented URLs, resumes paused turns and finishes", async () => {
    const product = await createProduct({
      name: "Acme Invoices",
      oneLiner: "Invoicing that chases late payments",
      description: "Automatic reminders for freelancers",
      website: "",
      pricing: "",
      targetCustomers: "",
      differentiators: "",
    });
    const real = "https://www.reddit.com/r/freelance/comments/abc123/invoicing_tool/";
    const { client, requests } = fakeClient([
      {
        stop_reason: "pause_turn",
        content: [
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "site:reddit.com invoicing tool" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "s1",
            content: [{ type: "web_search_result", url: real, title: "Invoicing tool?", encrypted_content: "x" }],
          },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Found one." },
          lead("t1", "https://old.reddit.com/r/freelance/comments/abc123/invoicing_tool"),
          lead("t2", "https://reddit.com/r/freelance/comments/zzz999/made_up"),
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Freelancers on r/freelance want reminders." }] },
    ]);

    const events: ProspectEvent[] = [];
    await prospect(product, { targetLeads: 5, autoDraft: false, emit: (e) => events.push(e), client });

    // Paused turn is sent back as-is (no extra user message) to resume.
    expect(requests[1].messages.at(-1)?.role).toBe("assistant");
    // Both tool results go back in a single user message; the invented URL is an error.
    const results = requests[2].messages.at(-1)?.content as { tool_use_id: string; is_error?: boolean }[];
    expect(results.map((r) => [r.tool_use_id, !!r.is_error])).toEqual([
      ["t1", false],
      ["t2", true],
    ]);

    const saved = await listLeads(product.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ intentScore: 85, status: "new", author: "u/freelancer" });

    expect(events.filter((e) => e.type === "search")).toEqual([{ type: "search", query: "site:reddit.com invoicing tool" }]);
    expect(events.some((e) => e.type === "rejected")).toBe(true);
    expect(events.at(-1)).toEqual({
      type: "done",
      leadsFound: 1,
      searches: 1,
      summary: "Freelancers on r/freelance want reminders.",
    });
  });

  it("stops accepting leads once the target is reached", async () => {
    const product = await newProduct();
    const urls = ["https://news.ycombinator.com/item?id=1", "https://news.ycombinator.com/item?id=2"];
    const { client, requests } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "web_search_tool_result",
            tool_use_id: "s1",
            content: urls.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "" })),
          },
          lead("a", urls[0]),
          lead("b", urls[1]),
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] },
    ]);
    await prospect(product, { targetLeads: 1, autoDraft: false, emit: () => undefined, client });
    const results = requests[1].messages.at(-1)?.content as { content: string; is_error?: boolean }[];
    expect(results[0].content).toMatch(/Target reached/);
    expect(results[1].is_error).toBe(true);
    expect(await listLeads(product.id)).toHaveLength(1);
  });

  it("re-issues a turn whose tool input was garbled JSON, but not other failures", async () => {
    const product = await newProduct();
    // Same message shape as the SDK's BetaMessageStream.
    const garbled = new Anthropic.AnthropicError(
      "Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt.",
    );
    const { client, requests } = fakeClient([
      { error: garbled },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Nothing found." }] },
    ]);
    await prospect(product, { targetLeads: 3, autoDraft: false, emit: () => undefined, client });
    expect(requests).toHaveLength(2);

    // The SDK's stream wraps these in the same AnthropicError class; neither may be retried.
    for (const message of [
      "Could not resolve authentication method.",
      "stream ended without producing a Message with role=assistant",
    ]) {
      const failure = new Anthropic.AnthropicError(message);
      const other = fakeClient([{ error: failure }]);
      await expect(
        prospect(product, { targetLeads: 3, autoDraft: false, emit: () => undefined, client: other.client }),
      ).rejects.toBe(failure);
      expect(other.requests).toHaveLength(1);
    }
  });
});
