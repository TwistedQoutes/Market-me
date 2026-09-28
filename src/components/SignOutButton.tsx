"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

/** Header button that ends the session and returns to the home page. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
