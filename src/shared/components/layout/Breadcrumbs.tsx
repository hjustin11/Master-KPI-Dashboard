"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n/I18nProvider";
import { isSectionRootPath } from "@/shared/lib/navSectionRoots";

export function Breadcrumbs() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const cleanPath = pathname.split("/").filter(Boolean);

  if (pathname === "/" || cleanPath.length === 0) {
    return null;
  }

  const items = cleanPath.map((segment, index) => {
    const key = `breadcrumbs.${segment}`;
    const translated = t(key);
    const label = translated === key ? segment : translated;
    return {
      label,
      href: `/${cleanPath.slice(0, index + 1).join("/")}`,
    };
  });

  return (
    <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.href} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : isSectionRootPath(item.href) ? (
              <span className="text-muted-foreground">{item.label}</span>
            ) : (
              <Link href={item.href} className="transition-colors duration-150 hover:text-foreground">
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
