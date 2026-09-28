import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { safeNextPath } from "@/lib/auth/constants";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Account creation page; already signed-in users go straight on to where they were headed. */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <AuthForm mode="signup" next={next} />;
}
