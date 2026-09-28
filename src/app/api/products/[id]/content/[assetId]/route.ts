import { NextResponse } from "next/server";
import { notFound } from "@/lib/http";
import { deleteAsset } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

/** Deletes one generated content asset. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, assetId } = await params;
  return (await deleteAsset(id, assetId)) ? new NextResponse(null, { status: 204 }) : notFound("Asset not found");
}
