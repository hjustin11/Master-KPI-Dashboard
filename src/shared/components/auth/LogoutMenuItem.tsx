"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { createClient } from "@/shared/lib/supabase/client";
import { useTranslation } from "@/i18n/I18nProvider";

export function LogoutMenuItem() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <DropdownMenuItem variant="destructive" onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      {t("auth.logout")}
    </DropdownMenuItem>
  );
}
