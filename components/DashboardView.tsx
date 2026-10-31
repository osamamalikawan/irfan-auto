"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty, rs } from "@/lib/format";
import type { Metric } from "@/lib/targets";
import CollectModal from "./CollectModal";
import MetricBar from "./MetricBar";
import { useMe } from "./Me";
import Toast from "./Toast";

type Data = {
  today: string; name: string;
  numbers?: { today_sales: number; today_invoices: number; today_collections: number; receivables?: number; money_in_hand?: number };
  low_stock?: { total: number; items: { id: string; name: string; on_hand: number; reorder: number; unit: string }[] };
  recent_sales?: { id: string; no: string; customer_name: string; total: number; paid: number; status: string }[];
  targets?: { from: string; to: string; rows: { id: string; name: string; sales: Metric; collection: Metric }[] };
  visits?: { routes: number; customers: number; visited: number; list: { id: string; name: string; code: string | null; customers: number; visited: number }[] };
};

export default function DashboardView() {
  const { user, can } = useMe();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/dashboard");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the dashboard");
    setError(""); setD(j);
  }, []);
  useEffect(() => { load(); }, [load]);

  const n = d?.numbers;
  const tile = (k: string, v: string, sub?: string, cls = "") => (<div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-xl font-bold " + cls}>{v}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>);
  const left = d?.visits ? d.visits.customers - d.visits.visited : 0;
  const empty = d && !d.numbers && !d.low_stock && !d.recent_sales && !d.targets && !d.visits;

  return (
    <div>
      <header className="px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-5 lg:pt-5">
        <h1 className="text-xl font-bold">Hello, {user.name}</h1>
        <p className="text-sm text-muted">{d ? niceDate(d.today) : ""} · {user.roleName}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {can("sales.create") && <Link href="/sales/new" className="btn btn-primary">New invoice</Link>}
          {can("payments.receive") && <button className="btn" onClick={() => setCollect(true)}>Collect payment</button>}
          {can("accounts.edit") && <Link href="/expenses" className="btn">Add expense</Link>}
          {can("visits.record") && <Link href="/route-plans" className="btn">Route plans</Link>}
        </div>
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!d && !error && <p className="text-sm text-muted">Loading…</p>}
        {empty && <p className="card p-4 text-sm text-muted">Open a module from the menu to get started.</p>}

        {(n || d?.visits) && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {n && tile("Today's sales", rs(n.today_sales), n.today_invoices + " invoice" + (n.today_invoices === 1 ? "" : "s"))}
            {n && tile("Today's collections", rs(n.today_collections), undefined, "text-green")}
            {n?.receivables !== undefined && tile("Customers owe", rs(n.receivables))}
            {n?.money_in_hand !== undefined && tile("Money in hand", rs(n.money_in_hand), "collected − paid out", n.money_in_hand < 0 ? "text-red" : "")}
            {d?.visits && tile("Visits left today", String(left), d.visits.visited + " of " + d.visits.customers + " done", left > 0 ? "text-amber" : "text-green")}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {d?.targets && (
            <section className="card p-4">
              <div className="mb-2 flex items-center"><h2 className="flex-1 font-semibold">Targets this month</h2><Link href="/team" className="text-sm text-accent underline">Sales Team</Link></div>
              {!d.targets.rows.length && <p className="text-sm text-muted">No salesmen yet.</p>}
              <ul className="space-y-4">
                {d.targets.rows.map((r) => (
                  <li key={r.id}><p className="mb-1 text-sm font-medium">{r.name}</p>
                    <div className="grid gap-2 sm:grid-cols-2"><MetricBar label="Sales" m={r.sales} /><MetricBar label="Collections" m={r.collection} /></div></li>
                ))}
              </ul>
            </section>
          )}

          {d?.visits && (
            <section className="card p-4">
              <div className="mb-2 flex items-center"><h2 className="flex-1 font-semibold">Today&apos;s visits</h2><Link href="/planner" className="text-sm text-accent underline">Monthly planner</Link></div>
              {!d.visits.list.length && <p className="text-sm text-muted">No route is planned for today.</p>}
              <ul className="divide-y divide-line">
                {d.visits.list.map((r) => (
                  <li key={r.id}><Link href={"/route-plans/" + r.id + "/" + d.today} className="flex items-center gap-2 py-2 active:opacity-70">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{r.name}</span>
                      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-bg"><span className="block h-full rounded-full bg-accent" style={{ width: (r.customers ? Math.round((r.visited / r.customers) * 100) : 0) + "%" }} /></span></span>
                    <span className="text-sm font-semibold">{r.visited} / {r.customers}</span>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}

          {d?.low_stock && (
            <section className="card p-4">
              <div className="mb-2 flex items-center"><h2 className="flex-1 font-semibold">Low stock</h2><Link href="/inventory?filter=low" className="text-sm text-accent underline">{d.low_stock.total ? "See all " + d.low_stock.total : "Stock"}</Link></div>
              {!d.low_stock.items.length && <p className="rounded-lg bg-green-bg p-2 text-sm text-green">Nothing is below its reorder level.</p>}
              <ul className="divide-y divide-line">
                {d.low_stock.items.map((p) => (
                  <li key={p.id}><Link href={"/inventory/" + p.id} className="flex items-center gap-2 py-2 active:opacity-70"><span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span className="pill bg-amber-bg text-amber">{qty(p.on_hand)} {p.unit}</span><span className="text-xs text-muted">min {qty(p.reorder)}</span></Link></li>
                ))}
              </ul>
            </section>
          )}

          {d?.recent_sales && (
            <section className="card p-4">
              <div className="mb-2 flex items-center"><h2 className="flex-1 font-semibold">Latest invoices</h2><Link href="/sales" className="text-sm text-accent underline">All sales</Link></div>
              {!d.recent_sales.length && <p className="text-sm text-muted">No invoices yet.</p>}
              <ul className="divide-y divide-line">
                {d.recent_sales.map((s) => {
                  const due = s.status === "confirmed" ? Number(s.total) - Number(s.paid) : 0;
                  return (
                    <li key={s.id}><Link href={"/sales/" + s.id} className="flex items-center gap-2 py-2 active:opacity-70">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{s.customer_name}</span><span className="text-xs text-muted">{s.no}{s.status === "cancelled" ? " · cancelled" : due > 0 ? " · due " + rs(due) : ""}</span></span>
                      <span className="font-semibold">{rs(s.total)}</span></Link></li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
      {collect && <CollectModal onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
