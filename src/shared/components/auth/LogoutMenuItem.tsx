"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { createClient } from "@/shared/lib/supabase/client";

export function LogoutMenuItem() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <DropdownMenuItem variant="destructive" onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      Logout
    </DropdownMenuItem>
  );
}
