import { NextResponse } from "next/server";
import { z } from "zod";
import { generateContent } from "@/lib/claude/content";
import { parseBody, requireProduct, withClaudeErrors } from "@/lib/http";
import { addAssets } from "@/lib/store";
import { ContentKindSchema } from "@/lib/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  kind: ContentKindSchema,
  instructions: z.string().max(2000).default(""),
});

/** Generates a content pack of the requested kind with Claude and stores its assets. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const owned = await requireProduct(id);
  if ("response" in owned) return owned.response;
  const { product } = owned;
  const body = await parseBody(request, Body);
  if ("response" in body) return body.response;
  const { kind, instructions } = body.data;
  return withClaudeErrors(async () => {
    const pack = await generateContent(product, kind, instructions, request.signal);
    const assets = await addAssets(pack.assets.map((a) => ({ ...a, productId: id, kind })));
    return NextResponse.json({ assets }, { status: 201 });
  });
}
