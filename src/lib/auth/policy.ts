/**
 * Who may create an account. Sign-ups decide who can spend your Claude
 * credits, so the default is closed after the first (owner) account:
 *
 * - `MARKETME_SIGNUPS=open`: anyone can sign up.
 * - `MARKETME_ALLOWED_EMAILS=a@x.com,*@company.com`: only matching emails.
 * - neither set: only the very first account can be created.
 */
export function canSignUp(
  email: string,
  existingUsers: number,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (existingUsers === 0) return true;
  if (env.MARKETME_SIGNUPS?.trim().toLowerCase() === "open") return true;
  const allowed = (env.MARKETME_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.some((entry) => (entry.startsWith("*@") ? email.endsWith(entry.slice(1)) : email === entry));
}
