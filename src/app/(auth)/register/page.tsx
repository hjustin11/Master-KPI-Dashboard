import { redirect } from "next/navigation";
import { UserAuthOverlay } from "@/shared/components/auth/UserAuthOverlay";
import { createClient } from "@/shared/lib/supabase/server";

type RegisterPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const inviteParam = params.invite;
  const emailParam = params.email;
  const roleParam = params.role;
  let inviteToken = Array.isArray(inviteParam) ? inviteParam[0] : inviteParam;
  let initialEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
  let invitedRole = Array.isArray(roleParam) ? roleParam[0] : roleParam;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Registrierung ist nur per Einladung erlaubt.
  // Robust: Falls Supabase den redirectTo ohne Query-Params ausliefert, nehmen wir den Token aus user_metadata.
  if ((!inviteToken || !initialEmail) && user) {
    const metaToken = user.user_metadata?.invite_token as string | undefined;
    if (!inviteToken && metaToken) inviteToken = metaToken;
    if (!initialEmail && user.email) initialEmail = user.email;
    if (!invitedRole) {
      invitedRole =
        (user.user_metadata?.role as string | undefined) ??
        (user.app_metadata?.role as string | undefined);
    }
  }

  if (!inviteToken || !initialEmail) {
    redirect("/login");
  }

  // Wenn man ueber den Invite-Link kommt, ist man oft bereits eingeloggt (Magic Link Session).
  // Dann muss hier das Passwort gesetzt werden, statt zu redirecten.
  if (user && user.email?.toLowerCase() !== initialEmail.toLowerCase()) {
    redirect("/");
  }

  return (
    <UserAuthOverlay
      initialMode="register"
      initialEmail={initialEmail}
      invitedRole={invitedRole}
      inviteToken={inviteToken}
    />
  );
}
