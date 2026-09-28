import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { safeNextPath } from "@/lib/auth/constants";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Sign-in page; already signed-in users go straight on to where they were headed. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <AuthForm mode="login" next={next} />;
}
