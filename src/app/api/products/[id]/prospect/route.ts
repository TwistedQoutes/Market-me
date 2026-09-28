import { z } from "zod";
import { describeClaudeError } from "@/lib/claude/client";
import { prospect } from "@/lib/claude/prospector";
import { generateStrategy } from "@/lib/claude/strategy";
import { notFound, parseBody } from "@/lib/http";
import { getProduct, saveStrategy } from "@/lib/store";
import type { Product, ProspectEvent } from "@/lib/types";

// Prospecting runs many searches; give it room on platforms that cap duration.
// Leads are saved as they're found, so a run cut off at the limit keeps its results.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  targetLeads: z.number().int().min(1).max(25).default(10),
  autoDraft: z.boolean().default(false),
});

/**
 * Runs the prospecting agent and streams its progress as server-sent events.
 * Closing the connection aborts the run so it stops spending API credits.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await getProduct(id);
  if (!found) return notFound("Product not found");
  let product: Product = found;
  const body = await parseBody(request, Body);
  if ("response" in body) return body.response;
  const { targetLeads, autoDraft } = body.data;

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    /** Runs the agent, forwarding each event to the client as it happens. */
    async start(controller) {
      /** Closes the stream once; safe to call after the client has gone. */
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      };
      /** Sends one event as an SSE `data:` line, unless the stream is closed. */
      const emit = (event: ProspectEvent) => {
        if (closed || abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true; // The client went away mid-run.
        }
      };
      try {
        if (autoDraft && !product.strategy) {
          emit({ type: "status", message: "Building your go-to-market strategy first…" });
          product = (await saveStrategy(id, await generateStrategy(product, abort.signal))) ?? product;
        }
        await prospect(product, { targetLeads, autoDraft, emit, signal: abort.signal });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error(err);
          emit({ type: "error", message: describeClaudeError(err) });
        }
      } finally {
        close();
      }
    },
    /** Client disconnected: stop emitting and abort the Claude calls. */
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
