import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/constants";

/** Pages anyone can open without signing in. */
const PUBLIC_PAGES = new Set(["/", "/login", "/signup"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Runs before every request. It does two cheap checks; the real session check
 * happens in each page and API route against the datastore.
 *
 * - Blocks state-changing API calls from other websites (backing up the
 *   SameSite session cookie).
 * - Sends visitors without a session cookie to the sign-in page.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (!SAFE_METHODS.has(request.method) && isCrossSite(request)) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.has(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

/**
 * True when the request's Origin names a different host. Compared by host
 * rather than full origin so TLS-terminating reverse proxies still work.
 */
function isCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return true;
  }
  const expected = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  return !expected.includes(host);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
