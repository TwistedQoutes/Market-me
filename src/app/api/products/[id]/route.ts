import { NextResponse } from "next/server";
import { notFound, parseBody } from "@/lib/http";
import { deleteProduct, getProduct, listAssets, listLeads, updateProduct } from "@/lib/store";
import { ProductInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return notFound("Product not found");
  const [leads, assets] = await Promise.all([listLeads(id), listAssets(id)]);
  return NextResponse.json({ product, leads, assets });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await parseBody(request, ProductInput.partial());
  if ("response" in body) return body.response;
  const product = await updateProduct(id, body.data);
  return product ? NextResponse.json({ product }) : notFound("Product not found");
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return (await deleteProduct(id)) ? new NextResponse(null, { status: 204 }) : notFound("Product not found");
}
