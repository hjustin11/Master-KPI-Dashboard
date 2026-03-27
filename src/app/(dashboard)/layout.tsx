import { AppSidebar } from "@/shared/components/layout/AppSidebar";
import { Breadcrumbs } from "@/shared/components/layout/Breadcrumbs";
import { Header } from "@/shared/components/layout/Header";
import { UserNav } from "@/shared/components/layout/UserNav";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen bg-muted/20">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex items-center justify-between border-b px-4 py-2">
          <Breadcrumbs />
          <UserNav />
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
