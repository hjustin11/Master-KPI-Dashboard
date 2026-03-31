import type { SupabaseClient } from "@supabase/supabase-js";

/** Einladung = verifizierte E-Mail: auth.users.email_confirmed_at setzen (kein Extra-Mail-Schritt). */
export async function confirmAuthUserEmail(admin: SupabaseClient, userId: string) {
  return admin.auth.admin.updateUserById(userId, { email_confirm: true });
}
