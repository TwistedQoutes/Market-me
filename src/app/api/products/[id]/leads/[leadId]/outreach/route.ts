import { NextResponse } from "next/server";
import { draftOutreach } from "@/lib/claude/outreach";
import { notFound, withClaudeErrors } from "@/lib/http";
import { getLead, getProduct, updateLead } from "@/lib/store";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; leadId: string }> };

/** Drafts (or redrafts) outreach for one lead with Claude and saves it on the lead. */
export async function POST(request: Request, { params }: Ctx) {
  const { id, leadId } = await params;
  const [product, lead] = await Promise.all([getProduct(id), getLead(id, leadId)]);
  if (!product || !lead) return notFound("Lead not found");
  return withClaudeErrors(async () => {
    const outreach = { ...(await draftOutreach(product, lead, request.signal)), generatedAt: new Date().toISOString() };
    return NextResponse.json({ lead: await updateLead(id, leadId, { outreach }) });
  });
}
