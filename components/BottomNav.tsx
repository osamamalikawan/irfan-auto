"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMe } from "./Me";

export default function BottomNav() {
  const path = usePathname();
  const filter = useSearchParams().get("filter");
  const { can, canAny } = useMe();
  const stock = canAny(["stock.view", "stock.transfer", "stock.adjust"]);
  const items = [
    { href: "/inventory", label: "Stock", icon: "▤", on: path === "/inventory" && !filter, show: stock },
    { href: "/inventory?filter=low", label: "Low stock", icon: "⚠", on: path === "/inventory" && filter === "low", show: stock },
    { href: "/inventory/new", label: "Add", icon: "＋", on: path === "/inventory/new", show: can("stock.manage") },
    { href: "/users", label: "Users", icon: "☺", on: path.startsWith("/users"), show: can("users.manage") },
    { href: "/settings", label: "Settings", icon: "⚙", on: path.startsWith("/settings"), show: can("settings.edit") },
    { href: "/account", label: "Me", icon: "●", on: path.startsWith("/account"), show: true },
  ].filter((i) => i.show);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto grid max-w-2xl grid-flow-col auto-cols-fr">
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
