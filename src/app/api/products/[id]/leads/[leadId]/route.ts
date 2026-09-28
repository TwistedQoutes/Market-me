import { NextResponse } from "next/server";
import { z } from "zod";
import { notFound, parseBody } from "@/lib/http";
import { deleteLead, updateLead } from "@/lib/store";
import { LEAD_STATUSES } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; leadId: string }> };

const Patch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(5000).optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, leadId } = await params;
  const body = await parseBody(request, Patch);
  if ("response" in body) return body.response;
  const lead = await updateLead(id, leadId, body.data);
  return lead ? NextResponse.json({ lead }) : notFound("Lead not found");
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, leadId } = await params;
  return (await deleteLead(id, leadId)) ? new NextResponse(null, { status: 204 }) : notFound("Lead not found");
}
