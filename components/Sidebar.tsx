"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SOON = ["Sales", "Customers", "Purchases", "Suppliers", "Accounts", "Users & Roles"];

/** Desktop only (lg and up). Mirrors the original prototype's dark side menu. */
export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col overflow-auto bg-side p-2.5 text-side-ink lg:flex">
      <div className="px-2.5 pb-3.5 pt-1 text-[15px] font-bold leading-tight text-white">
        Irfan Autos
        <small className="mt-0.5 block text-xs font-normal text-side-ink">Bike &amp; auto spare parts</small>
      </div>
      <Link href="/inventory" aria-current={path.startsWith("/inventory") ? "page" : undefined}
        className={"mb-px block rounded-md px-2.5 py-2 text-sm " + (path.startsWith("/inventory") ? "bg-accent font-semibold text-accent-ink" : "hover:bg-white/10")}>
        Stock &amp; Racks
      </Link>
      <hr className="my-2.5 border-white/10" />
      {SOON.map((x) => (
        <span key={x} title="Planned, not built yet" className="mb-px block cursor-default rounded-md px-2.5 py-2 text-sm opacity-45">{x}</span>
      ))}
    </aside>
  );
}
