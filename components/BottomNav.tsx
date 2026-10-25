"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function BottomNav() {
  const path = usePathname();
  const filter = useSearchParams().get("filter");
  const items = [
    { href: "/inventory", label: "Stock", icon: "▤", on: path === "/inventory" && !filter },
    { href: "/inventory?filter=low", label: "Low stock", icon: "⚠", on: path === "/inventory" && filter === "low" },
    { href: "/inventory/new", label: "Add", icon: "＋", on: path === "/inventory/new" },
    { href: "/settings", label: "Settings", icon: "⚙", on: path.startsWith("/settings") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 lg:hidden border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map((i) => (
          <Link key={i.label} href={i.href} aria-current={i.on ? "page" : undefined}
            className={"flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs " + (i.on ? "font-semibold text-accent" : "text-muted")}>
            <span className="text-lg leading-none" aria-hidden>{i.icon}</span>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
