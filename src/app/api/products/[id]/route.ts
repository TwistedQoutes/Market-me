import { NextResponse } from "next/server";
import { notFound, parseBody } from "@/lib/http";
import { deleteProduct, getProduct, listAssets, listLeads, updateProduct } from "@/lib/store";
import { ProductPatch } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Returns the product with its leads and content assets. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return notFound("Product not found");
  const [leads, assets] = await Promise.all([listLeads(id), listAssets(id)]);
  return NextResponse.json({ product, leads, assets });
}

/** Partially updates the product brief; omitted fields are left unchanged. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await parseBody(request, ProductPatch);
  if ("response" in body) return body.response;
  const product = await updateProduct(id, body.data);
  return product ? NextResponse.json({ product }) : notFound("Product not found");
}

/** Deletes the product and all its leads and content. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return (await deleteProduct(id)) ? new NextResponse(null, { status: 204 }) : notFound("Product not found");
}
