import { NextResponse } from "next/server";
import { parseBody } from "@/lib/http";
import { createProduct, listProducts } from "@/lib/store";
import { ProductInput } from "@/lib/types";

/** Lists all products, newest first. */
export async function GET() {
  return NextResponse.json({ products: await listProducts() });
}

/** Creates a product from a validated brief. */
export async function POST(request: Request) {
  const body = await parseBody(request, ProductInput);
  if ("response" in body) return body.response;
  return NextResponse.json({ product: await createProduct(body.data) }, { status: 201 });
}
