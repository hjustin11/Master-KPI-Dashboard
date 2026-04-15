"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { QueryProvider } from "@/shared/components/QueryProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <I18nProvider>{children}</I18nProvider>
    </QueryProvider>
  );
}
