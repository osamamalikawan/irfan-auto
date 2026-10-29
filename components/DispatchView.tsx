"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";

type D = { id: string; no: string; sale_date: string; customer_id: string; customer_name: string; dispatch_count: number; place: string; items: number; pieces: number };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;

export default function DispatchView() {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("today");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<D[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const t = todayPk();
    const p = new URLSearchParams({ status });
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    const r = await fetch("/api/dispatch?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load invoices");
    setError(""); setItems(j.items); setSel(new Set());
  }, [range, status]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = !!items?.length && sel.size === items.length;
  const open = (ids: string[], mode: "thermal" | "a4") => { window.open("/print/dispatch?mode=" + mode + "&ids=" + ids.join(","), "_blank"); setTimeout(load, 2500); };

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Dispatch vouchers</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter">
            <option value="pending">Not printed yet</option><option value="printed">Already printed</option><option value="all">All invoices</option>
          </select>
          <button className="btn" onClick={() => setSel(allOn ? new Set() : new Set(items?.map((i) => i.id)))}>{allOn ? "Clear all" : "Select all"}</button>
          <button className="btn btn-primary" disabled={!sel.size} onClick={() => open([...sel], "a4")}>Print selected on A4 ({sel.size})</button>
        </div>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
      </header>
      <div className="p-3 lg:px-5">
        <p className="mb-2 text-sm text-muted">Print a single voucher for the thermal printer, or tick several and print them on A4 sheets. Choose the right printer in the print window.</p>
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!items && !error && <p className="text-sm text-muted">Loading…</p>}
        {items && !items.length && <p className="text-sm text-muted">No invoices match. Change the dates or the filter.</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items?.map((s) => (
            <li key={s.id} className="card p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 size-5" checked={sel.has(s.id)} onChange={() => toggle(s.id)} aria-label={"Select " + s.no} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={"/sales/" + s.id} className="font-semibold hover:underline">{s.no}</Link>
                    <span className="text-xs text-muted">{niceDate(s.sale_date)}</span>
                    {s.dispatch_count > 0 ? <span className="pill bg-green-bg text-green">Printed {s.dispatch_count}×</span> : <span className="pill bg-amber-bg text-amber">Not printed</span>}</div>
                  <p className="truncate text-sm">{s.customer_name}</p>
                  <p className="text-xs text-muted">{[s.place, s.items + " items", s.pieces + " pieces"].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-primary min-h-9 flex-1" onClick={() => open([s.id], "thermal")}>Thermal voucher</button>
                <Link href={"/sales/" + s.id} className="btn min-h-9 flex-1">Invoice</Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
