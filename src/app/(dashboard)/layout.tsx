"use client";

import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/shared/components/layout/AppSidebar";
import { Header } from "@/shared/components/layout/Header";
import { RoleTestAccessToolbar } from "@/shared/components/layout/RoleTestAccessToolbar";
import { RoleTestAccessPersistOnExit } from "@/shared/components/layout/RoleTestAccessPersistOnExit";
import { MobileNav } from "@/shared/components/layout/MobileNav";
import { Toaster } from "@/components/ui/sonner";
import { DashboardAccessConfigSync } from "@/shared/components/DashboardAccessConfigSync";
import { TutorialRuntimeController } from "@/shared/components/tutorial/TutorialRuntimeController";
import { TutorialNavProvider } from "@/shared/components/tutorial/TutorialNavContext";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(true);
  const [tutorialLocked, setTutorialLocked] = useState(false);
  const [tutorialSidebarVisible, setTutorialSidebarVisible] = useState(true);
  const [tutorialVisibleSidebarKeys, setTutorialVisibleSidebarKeys] = useState<string[] | null>(null);

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
      <RoleTestAccessPersistOnExit />
      <div className="relative flex min-h-screen w-full overflow-hidden bg-gradient-to-br from-white via-white to-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-50/45 blur-3xl" />
          <div className="absolute -right-28 top-1/3 h-80 w-80 rounded-full bg-indigo-50/40 blur-3xl" />
          <div className="absolute bottom-[-130px] left-1/3 h-72 w-72 rounded-full bg-sky-50/45 blur-3xl" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-slate-900/[0.015]" />

        <TutorialNavProvider value={{ visibleSidebarKeys: tutorialVisibleSidebarKeys }}>
          {tutorialSidebarVisible ? <AppSidebar /> : null}
          <main
            data-tutorial-target="main-content"
            className="relative z-10 flex min-h-screen min-w-0 w-full flex-1 basis-0 flex-col"
          >
            <Header />
            <RoleTestAccessToolbar />
            <div
              className="flex flex-1 flex-col w-full max-w-none p-4 pb-20 md:p-6 md:pb-6 lg:p-8"
              style={tutorialLocked ? { filter: "blur(1.8px)", pointerEvents: "none" } : undefined}
            >
              {children}
            </div>
            {tutorialSidebarVisible ? <MobileNav /> : null}
          </main>
        </TutorialNavProvider>
        <TutorialRuntimeController
          onStateChange={(state) => {
            setTutorialLocked(state.locked);
            setTutorialSidebarVisible(state.sidebarVisible);
            setTutorialVisibleSidebarKeys(state.visibleSidebarKeys);
          }}
        />
        <Toaster richColors position="top-center" />
      </div>
    </SidebarProvider>
  );
}
