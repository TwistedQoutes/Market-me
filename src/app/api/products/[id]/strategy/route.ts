import { NextResponse } from "next/server";
import { generateStrategy } from "@/lib/claude/strategy";
import { notFound, withClaudeErrors } from "@/lib/http";
import { getProduct, saveStrategy } from "@/lib/store";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Generates the go-to-market strategy with Claude and saves it on the product. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return notFound("Product not found");
  return withClaudeErrors(async () => {
    const strategy = await generateStrategy(product, request.signal);
    return NextResponse.json({ product: await saveStrategy(id, strategy) });
  });
}
