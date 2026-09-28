import { NextResponse } from "next/server";
import { parseBody, requireUser } from "@/lib/http";
import { createProduct, listProducts } from "@/lib/store";
import { ProductInput } from "@/lib/types";

/** Lists the signed-in user's products, newest first. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ products: await listProducts(auth.user.id) });
}

/** Creates a product for the signed-in user from a validated brief. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(request, ProductInput);
  if ("response" in body) return body.response;
  return NextResponse.json({ product: await createProduct(auth.user.id, body.data) }, { status: 201 });
}
