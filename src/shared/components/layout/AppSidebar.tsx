"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ComponentType } from "react";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LayoutDashboard,
  Megaphone,
  Package,
  PanelLeft,
  Settings,
  ShoppingCart,
  User,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";
import {
  ROLE_OPTIONS,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";

type NavItem = {
  key: SidebarItemKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermissions?: PermissionKey[];
  children?: Array<{ label: string; href: string; requiredPermissions?: PermissionKey[] }>;
};

const navItems: NavItem[] = [
  { key: "overview", label: "Übersicht", href: "/", icon: LayoutDashboard },
  {
    key: "amazon",
    label: "Amazon",
    href: "/amazon",
    icon: ShoppingCart,
    requiredPermissions: ["manage_integrations"],
    children: [
      { label: "Bestellungen", href: "/amazon/orders" },
      { label: "Produkte", href: "/amazon/products" },
      { label: "Retouren", href: "/amazon/returns" },
    ],
  },
  {
    key: "xentral",
    label: "Xentral",
    href: "/xentral",
    icon: Package,
    requiredPermissions: ["manage_integrations"],
    children: [
      { label: "Artikel", href: "/xentral/products" },
      { label: "Lager", href: "/xentral/inventory" },
      { label: "Bestellungen", href: "/xentral/orders" },
    ],
  },
  {
    key: "advertising",
    label: "Werbung",
    href: "/advertising",
    icon: Megaphone,
    requiredPermissions: ["manage_integrations"],
    children: [
      { label: "Kampagnen", href: "/advertising/campaigns" },
      { label: "Performance", href: "/advertising/performance" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    requiredPermissions: ["export_data"],
  },
  {
    key: "settings",
    label: "Einstellungen",
    href: "/settings",
    icon: Settings,
    children: [
      { label: "Profil", href: "/settings/profile" },
      { label: "Benutzer", href: "/settings/users", requiredPermissions: ["manage_users"] },
      { label: "System", href: "/settings" },
    ],
  },
  {
    key: "updates",
    label: "Update & Feedback",
    href: "/updates",
    icon: Bell,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const user = useUser();
  const { hasPermission, canAccessSidebarItem } = usePermissions();
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const roleLabel = useAppStore(
    (stateFromStore) => stateFromStore.roleLabels[activeRole] ?? activeRole
  );
  const roleOptions = [
    ...ROLE_OPTIONS.map((item) => ({
      value: item.value,
      label: roleLabels[item.value] ?? item.label,
    })),
    ...customRoleKeys.map((key) => ({
      value: key,
      label: roleLabels[key] ?? key,
    })),
  ];
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Verhindert Hydration-Mismatch: initial immer expanded rendern,
  // erst nach dem Client-Mount den echten Sidebar-State verwenden.
  const collapsed = isHydrated ? state === "collapsed" : false;
  const canRoleSwitch = user.roleKey === "owner" && roleTestingEnabled;

  const cycleRole = (direction: "prev" | "next") => {
    if (!canRoleSwitch) return;
    const values = roleOptions.map((r) => r.value);
    const currentIndex = values.indexOf(activeRole);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      direction === "prev"
        ? (safeIndex - 1 + values.length) % values.length
        : (safeIndex + 1) % values.length;
    setActiveRole(values[nextIndex] ?? "owner");
  };

  return (
    <Sidebar collapsible="icon" className="hidden border-r border-border/50 bg-sidebar md:flex">
      <SidebarHeader className="h-14 border-b border-border/50 px-3">
        <div
          className={cn(
            "flex h-full items-center",
            collapsed ? "justify-center" : "justify-between"
          )}
        >
          {collapsed ? (
            <Image
              src="/brand/petrhein-icon-current.png"
              alt="PetRhein Icon"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-center">
                <Image
                  src="/brand/petrhein-logo-attached.png"
                  alt="PetRhein"
                  width={166}
                  height={34}
                  className="h-8 w-auto object-contain"
                />
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "transition-all duration-200",
              collapsed ? "absolute top-3 -right-1 z-20" : "ml-3"
            )}
            onClick={toggleSidebar}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <nav className="space-y-1">
          {navItems
            .filter(
              (item) =>
                canAccessSidebarItem(item.key) &&
                (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
            )
            .map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            const baseLink = (
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200 hover:bg-accent/60",
                  active && "border-l-2 border-primary bg-primary/10 text-primary",
                  collapsed && "justify-center px-2"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );

            return (
              <div key={item.href} className="space-y-1">
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger render={<div />}>{baseLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  baseLink
                )}

                {!collapsed && item.children?.length ? (
                  <div className="ml-7 space-y-1 border-l border-border pl-3">
                    {item.children
                      .filter(
                        (child) =>
                          child.requiredPermissions?.every((permission) =>
                            hasPermission(permission)
                          ) ?? true
                      )
                      .map((child) => {
                      const childActive = isActivePath(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
                            childActive && "text-primary"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
            })}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 hover:bg-accent/60",
                  collapsed && "justify-center"
                )}
              />
            }
          >
              <Avatar size="sm">
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.fullName}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
                    {canRoleSwitch ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("prev");
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label="Vorherige Rolle"
                          title="Vorherige Rolle"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("next");
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label="Nächste Rolle"
                          title="Nächste Rolle"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
              <User className="h-4 w-4" />
              Profil
            </DropdownMenuItem>
            {user.roleKey === "owner" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setRoleTestingEnabled(!roleTestingEnabled)}
                  className={roleTestingEnabled ? "bg-primary/10 text-primary" : ""}
                >
                  Rollen-Testmodus: {roleTestingEnabled ? "AN" : "AUS"}
                </DropdownMenuItem>

                {roleTestingEnabled ? (
                  <>
                    {activeRole !== "owner" ? (
                      <DropdownMenuItem onClick={() => setActiveRole("owner")}>
                        Owner-Ansicht wiederherstellen
                      </DropdownMenuItem>
                    ) : null}
                    {roleOptions.map((role) => (
                      <DropdownMenuItem
                        key={role.value}
                        onClick={() => setActiveRole(role.value)}
                        className={role.value === activeRole ? "bg-primary/10 text-primary" : ""}
                      >
                        Als {role.label} testen
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <LogoutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function MobileSidebarTrigger() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { hasPermission, canAccessSidebarItem } = usePermissions();
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const roleLabel = useAppStore(
    (stateFromStore) => stateFromStore.roleLabels[activeRole] ?? activeRole
  );
  const roleOptions = [
    ...ROLE_OPTIONS.map((item) => ({
      value: item.value,
      label: roleLabels[item.value] ?? item.label,
    })),
    ...customRoleKeys.map((key) => ({
      value: key,
      label: roleLabels[key] ?? key,
    })),
  ];

  const canRoleSwitch = user.roleKey === "owner" && roleTestingEnabled;

  const cycleRole = (direction: "prev" | "next") => {
    if (!canRoleSwitch) return;
    const values = roleOptions.map((r) => r.value);
    const currentIndex = values.indexOf(activeRole);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      direction === "prev"
        ? (safeIndex - 1 + values.length) % values.length
        : (safeIndex + 1) % values.length;
    setActiveRole(values[nextIndex] ?? "owner");
  };

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" className="md:hidden" />}>
        <PanelLeft className="h-4 w-4" />
        <span className="sr-only">Sidebar öffnen</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] border-r border-border/50 bg-card/80 backdrop-blur-sm">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Image
              src="/brand/petrhein-logo-attached.png"
              alt="PetRhein"
              width={144}
              height={32}
              className="h-8 w-auto object-contain"
            />
          </SheetTitle>
          <SheetDescription>Navigation</SheetDescription>
        </SheetHeader>
        <nav className="space-y-1 px-4 pb-4">
          {navItems
            .filter(
              (item) =>
                canAccessSidebarItem(item.key) &&
                (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
            )
            .map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <div key={item.href} className="space-y-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200 hover:bg-accent/60",
                    active && "border-l-2 border-primary bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
                {item.children?.length ? (
                  <div className="ml-7 space-y-1 border-l border-border/50 pl-3">
                    {item.children
                      .filter(
                        (child) =>
                          child.requiredPermissions?.every((permission) =>
                            hasPermission(permission)
                          ) ?? true
                      )
                      .map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
                          isActivePath(pathname, child.href) && "text-primary"
                        )}
                      >
                        {child.label}
                      </Link>
                      ))}
                  </div>
                ) : null}
              </div>
            );
            })}
        </nav>
        <div className="mt-auto border-t border-border/50 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <div
                  role="button"
                  tabIndex={0}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-all duration-200 hover:bg-accent/60"
                />
              }
            >
                <span className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{user.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel}
                    </span>
                    {canRoleSwitch ? (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("prev");
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label="Vorherige Rolle"
                          title="Vorherige Rolle"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("next");
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label="Nächste Rolle"
                          title="Nächste Rolle"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
                <User className="h-4 w-4" />
                Profil
              </DropdownMenuItem>
              {user.roleKey === "owner" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setRoleTestingEnabled(!roleTestingEnabled)}
                    className={roleTestingEnabled ? "bg-primary/10 text-primary" : ""}
                  >
                    Rollen-Testmodus: {roleTestingEnabled ? "AN" : "AUS"}
                  </DropdownMenuItem>

                  {roleTestingEnabled ? (
                    <>
                      {activeRole !== "owner" ? (
                        <DropdownMenuItem onClick={() => setActiveRole("owner")}>
                          Owner-Ansicht wiederherstellen
                        </DropdownMenuItem>
                      ) : null}
                      {roleOptions.map((role) => (
                        <DropdownMenuItem
                          key={role.value}
                          onClick={() => setActiveRole(role.value)}
                          className={role.value === activeRole ? "bg-primary/10 text-primary" : ""}
                        >
                          Als {role.label} testen
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <LogoutMenuItem />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetContent>
    </Sheet>
  );
}
