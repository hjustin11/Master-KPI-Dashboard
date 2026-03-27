"use client";

import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/shared/components/layout/AppSidebar";
import { Header } from "@/shared/components/layout/Header";
import { MobileNav } from "@/shared/components/layout/MobileNav";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const applyByWidth = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setOpen(true);
      } else if (width >= 768) {
        setOpen(false);
      }
    };

    applyByWidth();
    window.addEventListener("resize", applyByWidth);
    return () => window.removeEventListener("resize", applyByWidth);
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      style={
        {
          "--sidebar-width": "260px",
          "--sidebar-width-icon": "68px",
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar />
        <main className="flex min-h-screen min-w-0 w-full flex-1 basis-0 flex-col">
          <Header />
          <div className="flex-1 w-full max-w-none p-4 pb-20 md:p-6 md:pb-6 lg:p-8">
            {children}
          </div>
          <MobileNav />
        </main>
      </div>
    </SidebarProvider>
  );
}
