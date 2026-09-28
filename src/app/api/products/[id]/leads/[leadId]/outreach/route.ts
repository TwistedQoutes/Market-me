import { NextResponse } from "next/server";
import { draftOutreach } from "@/lib/claude/outreach";
import { notFound, requireProduct, withClaudeErrors } from "@/lib/http";
import { getLead, updateLead } from "@/lib/store";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; leadId: string }> };

/** Drafts (or redrafts) outreach for one lead with Claude and saves it on the lead. */
export async function POST(request: Request, { params }: Ctx) {
  const { id, leadId } = await params;
  const owned = await requireProduct(id);
  if ("response" in owned) return owned.response;
  const { product } = owned;
  const lead = await getLead(id, leadId);
  if (!lead) return notFound("Lead not found");
  return withClaudeErrors(async () => {
    const outreach = { ...(await draftOutreach(product, lead, request.signal)), generatedAt: new Date().toISOString() };
    return NextResponse.json({ lead: await updateLead(id, leadId, { outreach }) });
  });
}
