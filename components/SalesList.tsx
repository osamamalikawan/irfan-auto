"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import CollectModal from "./CollectModal";
import { useMe } from "./Me";
import Toast from "./Toast";
import { ListSkeleton, LoadingBar, Spinner } from "./Loading";

type Sale = { id: string; no: string; sale_date: string; customer_name: string; total: number; paid: number; status: string; items: number };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;
const PAGE = 30;

export function saleState(s: { total: number; paid: number; status: string }) {
  if (s.status === "cancelled") return { label: "Cancelled", cls: "bg-bg text-muted" };
  const due = Number(s.total) - Number(s.paid);
  if (due <= 0) return { label: "Paid", cls: "bg-green-bg text-green" };
  return Number(s.paid) > 0 ? { label: "Part paid", cls: "bg-amber-bg text-amber" } : { label: "On credit", cls: "bg-red-bg text-red" };
}

export default function SalesList() {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("today");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const t = todayPk();
    const p = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE) });
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    try {
      const r = await fetch("/api/sales?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load invoices");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(j.total);
    } catch (e) { if (id === req.current) setError((e as Error).message); }
    finally { if (id === req.current) setLoading(false); }
  }, [q, range]);

  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);

  const sum = items.filter((s) => s.status === "confirmed").reduce((x, s) => x + Number(s.total), 0);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pb-0 lg:pt-4">
        <div className="mb-2 flex items-baseline justify-between lg:hidden">
          <h1 className="text-lg font-bold leading-tight">Sales</h1>
          <span className="text-xs text-muted">{loading && !items.length ? <><Spinner /> Loading…</> : total.toLocaleString() + " invoices"}</span>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex gap-2 lg:order-1">
            {can("sales.create") && <Link href="/sales/new" className="btn btn-primary flex-1 lg:flex-none">New invoice</Link>}
            {can("payments.receive") && <button className="btn flex-1 lg:flex-none" onClick={() => setCollect(true)}>Collect payment</button>}
          </div>
          <div className="relative w-full lg:order-3 lg:flex-1">
            <input className="input pr-10" type="text" inputMode="search" enterKeyHint="search" placeholder="Search invoice number or customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
            {q && <button type="button" className="btn absolute inset-y-0 right-1 min-h-9 border-0 bg-transparent px-2" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
        </div>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:mt-3 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {loading && !items.length && !error && <ListSkeleton />}

      {items.length > 0 && <p className="px-3 pt-2 text-sm text-muted lg:px-5">Shown: <b className="text-ink">{rs(sum)}</b> in {items.filter((s) => s.status === "confirmed").length} confirmed invoices</p>}

      <ul className="space-y-2 p-3 lg:hidden">
        {items.map((s) => {
          const st = saleState(s);
          return (
            <li key={s.id}>
              <Link href={"/sales/" + s.id} className="card block p-3 active:opacity-70">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-semibold leading-snug">{s.customer_name}</p>
                  <span className={"pill " + st.cls}>{st.label}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="text-muted">{s.no} · {niceDate(s.sale_date)} · {s.items} item{s.items === 1 ? "" : "s"}</span>
                  <span className="font-semibold">{rs(s.total)}</span>
                </div>
                {s.status === "confirmed" && Number(s.total) - Number(s.paid) > 0 && <p className="text-right text-xs text-red">Due {rs(Number(s.total) - Number(s.paid))}</p>}
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="card mx-5 mt-3 hidden p-3.5 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-[12.5px] text-muted">
              {["Invoice", "Date", "Customer", "Items"].map((h) => <th key={h} className="border-b border-line px-2 py-1.5 font-semibold">{h}</th>)}
              {["Total", "Paid", "Due"].map((h) => <th key={h} className="border-b border-line px-2 py-1.5 text-right font-semibold">{h}</th>)}
              <th className="border-b border-line px-2 py-1.5 font-semibold">Status</th><th className="border-b border-line px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {items.map((s) => { const st = saleState(s); const due = s.status === "confirmed" ? Number(s.total) - Number(s.paid) : 0; return (
                <tr key={s.id} className="hover:bg-bg">
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold"><Link href={"/sales/" + s.id} className="hover:underline">{s.no}</Link></td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2">{niceDate(s.sale_date)}</td>
                  <td className="border-b border-line px-2 py-2">{s.customer_name}</td>
                  <td className="border-b border-line px-2 py-2">{s.items}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{rs(s.total)}</td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{rs(s.paid)}</td>
                  <td className={"whitespace-nowrap border-b border-line px-2 py-2 text-right " + (due > 0 ? "font-semibold text-red" : "")}>{due > 0 ? rs(due) : "—"}</td>
                  <td className="border-b border-line px-2 py-2"><span className={"pill " + st.cls}>{st.label}</span></td>
                  <td className="border-b border-line px-2 py-2 text-right"><Link href={"/sales/" + s.id} className="btn min-h-8 px-2 text-[13px]">Open</Link></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="px-3 pb-6 text-center text-sm text-muted lg:px-5 lg:pt-3">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No invoices in this period.</p>}
        {items.length < total && <button className="btn w-full lg:w-auto" disabled={loading} onClick={() => load(items.length)}>{loading ? <><Spinner /> Loading…</> : "Load more (" + (total - items.length) + " left)"}</button>}
      </div>

      {collect && <CollectModal onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(0); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
