import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

/** Signs the current user out. */
export async function POST() {
  await endSession();
  return new NextResponse(null, { status: 204 });
}
