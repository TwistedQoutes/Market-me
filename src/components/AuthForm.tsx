"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Card, ErrorNote, Field, inputClass } from "./ui";

/** Email + password form for signing in or creating an account. */
export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";
  const otherQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{signup ? "Create your account" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-muted">
          {signup ? "Start finding people who want to buy what you build." : "Welcome back to Market-me."}
        </p>
      </div>
      <Card>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api(`/api/auth/${mode}`, { json: { email, password } });
              router.replace(next);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password" hint={signup ? "At least 8 characters." : undefined}>
            <input
              type="password"
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            {signup ? "Create account" : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New to Market-me? "}
        <Link href={`/${signup ? "login" : "signup"}${otherQuery}`} className="text-accent hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
