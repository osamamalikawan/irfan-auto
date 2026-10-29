"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "./Me";

const SOON = ["Purchases", "Suppliers", "Accounts"];

/** Desktop only (lg and up). Mirrors the original prototype's dark side menu. */
export default function Sidebar() {
  const path = usePathname();
  const { user, can, canAny } = useMe();
  const items = [
    { href: "/inventory", label: "Stock & Racks", show: canAny(["stock.view", "stock.transfer", "stock.adjust"]) },
    { href: "/sales", label: "Sales", show: canAny(["sales.create", "payments.receive"]) },
    { href: "/returns", label: "Returns", show: canAny(["sales.return", "reports.view"]) },
    { href: "/dispatch", label: "Dispatch vouchers", show: canAny(["sales.create", "stock.view", "stock.transfer"]) },
    { href: "/customers", label: "Customers", show: canAny(["customers.view", "customers.edit", "sales.create"]) },
    { href: "/routes", label: "Routes & Areas", show: can("routes.manage") },
    { href: "/expenses", label: "Expenses", show: canAny(["accounts.edit", "reports.view"]) },
    { href: "/vouchers", label: "Payment vouchers", show: canAny(["payments.receive", "accounts.edit", "reports.view"]) },
    { href: "/users", label: "Users & Roles", show: can("users.manage") },
    { href: "/settings", label: "Settings", show: can("settings.edit") },
  ].filter((i) => i.show);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col overflow-auto bg-side p-2.5 text-side-ink lg:flex">
      <div className="px-2.5 pb-3.5 pt-1 text-[15px] font-bold leading-tight text-white">
        Irfan Autos
        <small className="mt-0.5 block text-xs font-normal text-side-ink">Bike &amp; auto spare parts</small>
      </div>
      {items.map((n) => {
        const on = path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
            className={"mb-px block rounded-md px-2.5 py-2 text-sm " + (on ? "bg-accent font-semibold text-accent-ink" : "hover:bg-white/10")}>
            {n.label}
          </Link>
        );
      })}
      <hr className="my-2.5 border-white/10" />
      {SOON.map((x) => (
        <span key={x} title="Planned, not built yet" className="mb-px block cursor-default rounded-md px-2.5 py-2 text-sm opacity-45">{x}</span>
      ))}
      <div className="mt-auto border-t border-white/10 pt-2.5">
        <Link href="/account" className={"block rounded-md px-2.5 py-2 text-sm hover:bg-white/10 " + (path.startsWith("/account") ? "bg-white/10" : "")}>
          <span className="block font-semibold text-white">{user.name}</span>
          <span className="text-xs">{user.roleName} · My account</span>
        </Link>
        <button className="mt-1 block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/10" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  );
}
