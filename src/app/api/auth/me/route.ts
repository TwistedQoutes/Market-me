import { NextResponse } from "next/server";
import { requireUser } from "@/lib/http";

/** Returns the signed-in user, or 401. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ user: auth.user });
}
