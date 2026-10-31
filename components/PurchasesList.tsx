"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import { useMe } from "./Me";
import { ListSkeleton, LoadingBar, Spinner } from "./Loading";

type P = { id: string; no: string; purchase_date: string; supplier_name: string; supplier_inv_no: string | null; total: number; paid: number; status: string; items: number };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;

export default function PurchasesList() {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<P[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const req = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const t = todayPk();
    const p = new URLSearchParams({ q, offset: String(offset), limit: "30" });
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    try {
      const r = await fetch("/api/purchases?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load purchases");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items)); setTotal(j.total);
    } catch (e) { if (id === req.current) setError((e as Error).message); }
    finally { if (id === req.current) setLoading(false); }
  }, [q, range]);
  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);

  const sum = items.filter((p) => p.status === "confirmed").reduce((x, p) => x + Number(p.total), 0);
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 flex items-baseline justify-between lg:hidden"><h1 className="text-lg font-bold">Purchases</h1><span className="text-xs text-muted">{total} purchases</span></div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {can("purchases.create") && <Link href="/purchases/new" className="btn btn-primary lg:order-1">New purchase</Link>}
          <div className="relative w-full lg:order-2 lg:flex-1">
            <input className="input pr-10" type="text" inputMode="search" placeholder="Search number, supplier or bill number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search purchases" />
            {q && <button type="button" className="btn absolute inset-y-0 right-1 min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
        </div>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:mt-3 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {loading && !items.length && !error && <ListSkeleton />}
      <div className="p-3 lg:px-5">
        {items.length > 0 && <p className="mb-2 text-sm text-muted">Shown: <b className="text-ink">{rs(sum)}</b> in confirmed purchases</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((p) => {
            const due = p.status === "confirmed" ? Number(p.total) - Number(p.paid) : 0;
            return (
              <li key={p.id}><Link href={"/purchases/" + p.id} className="card block p-3 active:opacity-70">
                <div className="flex items-start gap-2"><p className="min-w-0 flex-1 font-semibold leading-snug">{p.supplier_name}</p>
                  {p.status === "cancelled" ? <span className="pill bg-bg text-muted">Cancelled</span> : due > 0 ? <span className="pill bg-amber-bg text-amber">Owed {rs(due)}</span> : <span className="pill bg-green-bg text-green">Paid</span>}</div>
                <div className="mt-1 flex items-baseline justify-between text-sm"><span className="text-muted">{p.no} · {niceDate(p.purchase_date)}{p.supplier_inv_no ? " · bill " + p.supplier_inv_no : ""} · {p.items} items</span><span className="font-semibold">{rs(p.total)}</span></div>
              </Link></li>
            );
          })}
        </ul>
        {error && <p className="mt-2 text-center text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p className="py-4 text-center text-sm text-muted">No purchases in this period.</p>}
        {items.length < total && <div className="mt-3 text-center"><button className="btn" disabled={loading} onClick={() => load(items.length)}>{loading ? <><Spinner /> Loading…</> : "Load more"}</button></div>}
      </div>
    </div>
  );
}
