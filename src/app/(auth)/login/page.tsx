import { redirect } from "next/navigation";
import { UserAuthOverlay } from "@/shared/components/auth/UserAuthOverlay";
import { createClient } from "@/shared/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const modeParam = params.mode;
  const emailParam = params.email;
  const mode = Array.isArray(modeParam) ? modeParam[0] : modeParam;
  const initialEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <UserAuthOverlay
      initialMode={mode === "register" ? "register" : "login"}
      initialEmail={initialEmail}
    />
  );
}
