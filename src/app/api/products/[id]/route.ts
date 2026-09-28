import { NextResponse } from "next/server";
import { notFound, parseBody, requireProduct, requireUser } from "@/lib/http";
import { deleteProduct, listAssets, listLeads, updateProduct } from "@/lib/store";
import { ProductPatch } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Returns the product with its leads and content assets. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const owned = await requireProduct(id);
  if ("response" in owned) return owned.response;
  const [leads, assets] = await Promise.all([listLeads(id), listAssets(id)]);
  return NextResponse.json({ product: owned.product, leads, assets });
}

/** Partially updates the product brief; omitted fields are left unchanged. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, ProductPatch);
  if ("response" in body) return body.response;
  const product = await updateProduct(auth.user.id, id, body.data);
  return product ? NextResponse.json({ product }) : notFound("Product not found");
}

/** Deletes the product and all its leads and content. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return (await deleteProduct(auth.user.id, id)) ? new NextResponse(null, { status: 204 }) : notFound("Product not found");
}
