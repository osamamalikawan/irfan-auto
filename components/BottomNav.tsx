"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { visibleMenu } from "@/lib/menu";
import { canAddCustomer } from "@/lib/permissions";
import { useMe } from "./Me";

/** Phone navigation: the modules a person uses most, plus a "More" sheet for everything else. */
export default function BottomNav() {
  const path = usePathname();
  const filter = useSearchParams().get("filter");
  const { user, can, canAny } = useMe();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path, filter]);

  const stock = canAny(["stock.view", "stock.transfer", "stock.adjust"]);
  const customers = canAny(["customers.view", "customers.edit", "sales.create"]);
  const sales = canAny(["sales.create", "payments.receive"]);
  const main = [
    { href: "/inventory", label: "Stock", icon: "▤", on: path.startsWith("/inventory"), show: stock },
    { href: "/sales", label: "Sales", icon: "₨", on: path.startsWith("/sales"), show: sales },
    { href: "/customers", label: "Customers", icon: "☺", on: path.startsWith("/customers"), show: customers },
    { href: "/routes", label: "Routes", icon: "⇄", on: path.startsWith("/routes"), show: can("routes.manage") },
  ].filter((i) => i.show);
  const groups = visibleMenu(user);
  const moreOn = ["/users", "/settings", "/account", "/returns", "/dispatch", "/expenses", "/vouchers", "/purchases", "/suppliers", "/accounts", "/planner", "/route-plans"].some((p) => path.startsWith(p));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  const cell = "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ";
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-2xl grid-flow-col auto-cols-fr">
          {main.map((i) => (
            <Link key={i.label} href={i.href} aria-current={i.on ? "page" : undefined} className={cell + (i.on ? "font-semibold text-accent" : "text-muted")}>
              <span className="text-lg leading-none" aria-hidden>{i.icon}</span>{i.label}
            </Link>
          ))}
          <button className={cell + (moreOn || open ? "font-semibold text-accent" : "text-muted")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="More">
            <span className="text-lg leading-none" aria-hidden>⋯</span>More
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}
            className="mx-auto max-h-[85dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-2 pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
            <div className="mx-auto my-2 h-1 w-10 rounded-full bg-line" />
            <ul>
              {groups.map((g) => (
                <li key={g.label}>
                  <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>
                  <ul>
                    {g.items.map((i) => (
                      <li key={i.href}><Link href={i.href} className="flex min-h-12 items-center rounded-lg px-4 text-base active:bg-bg">{i.label}</Link></li>
                    ))}
                  </ul>
                </li>
              ))}
              <li>
                <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Quick add</p>
                {canAddCustomer(user) && <Link href="/customers/new" className="flex min-h-12 items-center rounded-lg px-4 text-base active:bg-bg">Add customer</Link>}
                <Link href="/account" className="flex min-h-12 items-center rounded-lg px-4 text-base active:bg-bg">My account</Link>
              </li>
              <li><button className="flex min-h-12 w-full items-center rounded-lg px-4 text-left text-base text-red active:bg-bg" onClick={signOut}>Sign out</button></li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
