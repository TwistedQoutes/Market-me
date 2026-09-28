import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser } from "@/lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market-me",
  description: "Claude finds the people who want to buy your product, then does the marketing for you.",
};

/** App shell: the header and navigation around every page. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm text-accent-fg">M</span>
              Market-me
            </Link>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
                <SignOutButton />
                <Link
                  href="/products/new"
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  New product
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  Get started
                </Link>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
