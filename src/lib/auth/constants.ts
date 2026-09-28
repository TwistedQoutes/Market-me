/** Name of the session cookie. Kept dependency-free so the proxy can import it. */
export const SESSION_COOKIE = "mm_session";

/**
 * Where to send the user after signing in: only same-site paths, so a crafted
 * `?next=` link can't bounce someone to another website.
 */
export function safeNextPath(next: string | undefined | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
