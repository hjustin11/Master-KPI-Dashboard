"use client";

import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/shared/components/layout/AppSidebar";
import { Header } from "@/shared/components/layout/Header";
import { MobileNav } from "@/shared/components/layout/MobileNav";
import { Toaster } from "@/components/ui/sonner";
import { DashboardAccessConfigSync } from "@/shared/components/DashboardAccessConfigSync";

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
      <DashboardAccessConfigSync />
      <div className="relative flex min-h-screen w-full overflow-hidden bg-gradient-to-br from-white via-white to-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-50/45 blur-3xl" />
          <div className="absolute -right-28 top-1/3 h-80 w-80 rounded-full bg-indigo-50/40 blur-3xl" />
          <div className="absolute bottom-[-130px] left-1/3 h-72 w-72 rounded-full bg-sky-50/45 blur-3xl" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-slate-900/[0.015]" />

        <AppSidebar />
        <main className="relative z-10 flex min-h-screen min-w-0 w-full flex-1 basis-0 flex-col">
          <Header />
          <div className="flex flex-1 flex-col w-full max-w-none p-4 pb-20 md:p-6 md:pb-6 lg:p-8">
            {children}
          </div>
          <MobileNav />
        </main>
        <Toaster richColors position="top-center" />
      </div>
    </SidebarProvider>
  );
}
