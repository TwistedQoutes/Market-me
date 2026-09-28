import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password gate. When MARKETME_PASSWORD is set, every page and API
 * route requires HTTP Basic auth (user "admin"), which keeps strangers from
 * spending your Claude credits on a deployed instance.
 */
export function proxy(request: NextRequest) {
  const password = process.env.MARKETME_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      // Malformed credentials fall through to the 401 below.
    }
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded && safeEqual(supplied, password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Market-me", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
