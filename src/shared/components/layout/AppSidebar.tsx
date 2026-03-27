import Link from "next/link";

const items = [
  { href: "/", label: "Home" },
  { href: "/amazon", label: "Amazon" },
  { href: "/xentral", label: "Xentral" },
  { href: "/advertising", label: "Advertising" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
  { href: "/updates", label: "Updates" },
];

export function AppSidebar() {
  return (
    <aside className="w-64 border-r bg-card">
      <div className="border-b p-4">
        <p className="text-sm text-muted-foreground">Master Dashboard</p>
      </div>
      <nav className="space-y-1 p-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
