"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import { FULFIL, saleKind, statusPill } from "@/lib/sale-types";
import CollectModal from "./CollectModal";
import PrintModal, { type PrintJob } from "./PrintModal";
import type { PrintType } from "./SalePrint";
import { useMe } from "./Me";
import Toast from "./Toast";
import { ListSkeleton, LoadingBar, Spinner } from "./Loading";

type Sale = {
  id: string; no: string; sale_date: string; customer_name: string; total: number; paid: number; status: string; items: number;
  fulfil_status: string; sale_kind: string; pay_term: string;
};
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;
const STATUSES = [["", "All"], ["active", "Active"], ["packed", "Packed"], ["delivered", "Delivered"], ["completed", "Completed"], ["cancelled", "Cancelled"]] as const;
const KINDS = [["", "All types"], ["counter", "Counter"], ["cash", "Cash"], ["credit", "Credit"]] as const;
const PAGE = 30;

export function saleState(s: { total: number; paid: number; status: string }) {
  if (s.status === "cancelled") return { label: "Cancelled", cls: "bg-bg text-muted" };
  const due = Number(s.total) - Number(s.paid);
  if (due <= 0) return { label: "Paid", cls: "bg-green-bg text-green" };
  return Number(s.paid) > 0 ? { label: "Part paid", cls: "bg-amber-bg text-amber" } : { label: "On credit", cls: "bg-red-bg text-red" };
}

const PRINT_CHOICES: [PrintType, "roll" | "a4", string][] = [
  ["invoice", "roll", "Invoice (80mm)"], ["gateout", "roll", "Gate-out slip (80mm)"],
  ["invoice", "a4", "Invoice (A4)"], ["gateout", "a4", "Gate-out slip (A4)"], ["delivery", "a4", "Delivery slip (A4)"],
];

/** "Print" button on a row: pick what to print for that invoice. The menu is fixed-position so the table's scroll area cannot clip it. */
function PrintMenu({ cancelled, onPick }: { cancelled: boolean; onPick: (type: PrintType, layout: "roll" | "a4") => void }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", key); };
  }, [at]);
  return (
    <>
      <button className="btn min-h-8 px-2.5 text-[13px]" aria-haspopup="menu" aria-expanded={!!at}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAt(at ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }); }}>Print ▾</button>
      {at && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAt(null)} />
          <div role="menu" className="fixed z-50 w-52 rounded-xl border border-line bg-surface p-1 shadow-lg" style={{ top: at.top, right: at.right }}>
            {PRINT_CHOICES.filter(([t]) => !cancelled || t === "invoice").map(([t, l, label]) => (
              <button key={label} role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => { setAt(null); onPick(t, l); }}>{label}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function SalesList({ initialStatus = "", initialRange = "today" }: { initialStatus?: string; initialRange?: string }) {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>(initialRange as (typeof RANGES)[number][0]);
  const [status, setStatus] = useState(initialStatus);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [toast, setToast] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [changing, setChanging] = useState<string | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);
  const req = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const t = todayPk();
    const p = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE) });
    if (status) p.set("status", status);
    if (kind) p.set("kind", kind);
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
  }, [q, range, status, kind]);

  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSel(new Set()); }, [q, range, status, kind]);

  async function changeStatus(s: Sale, next: string) {
    setChanging(s.id);
    const r = await fetch("/api/sales/" + s.id + "/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    const j = await r.json().catch(() => ({}));
    setChanging(null);
    if (!r.ok) return setToast(j.error || "Could not change the status");
    setItems((list) => list.map((x) => (x.id === s.id ? { ...x, fulfil_status: next } : x)));
    setToast(s.no + " is now " + (FULFIL.find(([k]) => k === next)?.[1] ?? next));
  }

  const live = items.filter((s) => s.status === "confirmed");
  const sum = live.reduce((x, s) => x + Number(s.total), 0);
  const ids = items.filter((s) => sel.has(s.id)).map((s) => s.id);
  const allOn = items.length > 0 && items.every((s) => sel.has(s.id));
  const toggle = (id: string) => setSel((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:mt-3 lg:px-0" role="group" aria-label="Status">
          {STATUSES.map(([k, label]) => <button key={k} className={"chip " + (status === k ? "chip-on" : "")} onClick={() => setStatus(k)}>{label}</button>)}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0" role="group" aria-label="Sale type">
          {KINDS.map(([k, label]) => <button key={k} className={"chip " + (kind === k ? "chip-on" : "")} onClick={() => setKind(k)}>{label}</button>)}
        </div>
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {loading && !items.length && !error && <ListSkeleton />}

      {items.length > 0 && <p className="px-3 pt-2 text-sm text-muted lg:px-5">Shown: <b className="text-ink">{rs(sum)}</b> in {live.length} invoice{live.length === 1 ? "" : "s"} (cancelled not counted)</p>}

      {ids.length > 0 && (
        <div data-noprint className="mx-3 mt-2 hidden flex-wrap items-center gap-2 rounded-xl border border-accent bg-surface p-2 lg:mx-5 lg:flex">
          <b className="px-2 text-sm">{ids.length} selected</b>
          {PRINT_CHOICES.map(([t, l, label]) => <button key={label} className="btn min-h-9 px-3" onClick={() => setJob({ ids, type: t, layout: l })}>{label}</button>)}
          <button className="btn ml-auto min-h-9 border-0 bg-transparent px-3 text-muted" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <ul className="space-y-2 p-3 lg:hidden">
        {items.map((s) => {
          const st = statusPill(s), k = saleKind(s);
          return (
            <li key={s.id}>
              <Link href={"/sales/" + s.id} className={"card block border-l-4 p-3 active:opacity-70 " + k.bar}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-semibold leading-snug">{s.customer_name}</p>
                  <span className={"pill " + k.pill}>{k.label}</span>
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
              <th className="w-8 border-b border-line px-2 py-1.5"><input type="checkbox" aria-label="Select all invoices shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((s) => s.id)))} /></th>
              {["Invoice", "Date", "Customer", "Type", "Items"].map((h) => <th key={h} className="border-b border-line px-2 py-1.5 font-semibold">{h}</th>)}
              {["Total", "Paid", "Due"].map((h) => <th key={h} className="border-b border-line px-2 py-1.5 text-right font-semibold">{h}</th>)}
              <th className="border-b border-line px-2 py-1.5 font-semibold">Status</th>
              <th className="border-b border-line px-2 py-1.5"><span className="sr-only">Print</span></th>
            </tr></thead>
            <tbody>
              {items.map((s) => {
                const st = statusPill(s), k = saleKind(s);
                const due = s.status === "confirmed" ? Number(s.total) - Number(s.paid) : 0;
                const editable = can("sales.status") && s.status === "confirmed";
                return (
                  <tr key={s.id} className={"hover:bg-bg " + (sel.has(s.id) ? "bg-bg" : "")}>
                    <td className={"border-b border-l-4 border-line px-2 py-2 " + k.bar}><input type="checkbox" aria-label={"Select " + s.no} checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold"><Link href={"/sales/" + s.id} className="hover:underline">{s.no}</Link></td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2">{niceDate(s.sale_date)}</td>
                    <td className="border-b border-line px-2 py-2">{s.customer_name}</td>
                    <td className="border-b border-line px-2 py-2"><span className={"pill " + k.pill}>{k.label}</span></td>
                    <td className="border-b border-line px-2 py-2">{s.items}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{rs(s.total)}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right">{rs(s.paid)}</td>
                    <td className={"whitespace-nowrap border-b border-line px-2 py-2 text-right " + (due > 0 ? "font-semibold text-red" : "")}>{due > 0 ? rs(due) : "—"}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2">
                      {editable ? (
                        <span className="inline-flex items-center gap-1.5">
                          <select className="input min-h-8 w-32 py-0 text-[13px]" aria-label={"Status of " + s.no} value={s.fulfil_status} disabled={changing === s.id} onChange={(e) => changeStatus(s, e.target.value)}>
                            {FULFIL.map(([key, label]) => <option key={key} value={key}>{key === "active" && s.sale_kind === "counter" && due > 0 ? "Active (Hold)" : label}</option>)}
                          </select>
                          {changing === s.id && <Spinner />}
                        </span>
                      ) : <span className={"pill " + st.cls}>{st.label}</span>}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right"><PrintMenu cancelled={s.status === "cancelled"} onPick={(t, l) => setJob({ ids: [s.id], type: t, layout: l })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="px-3 pb-6 text-center text-sm text-muted lg:px-5 lg:pt-3">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No invoices for this filter.</p>}
        {items.length < total && <button className="btn w-full lg:w-auto" disabled={loading} onClick={() => load(items.length)}>{loading ? <><Spinner /> Loading…</> : "Load more (" + (total - items.length) + " left)"}</button>}
      </div>

      {collect && <CollectModal onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(0); }} />}
      {job && <PrintModal job={job} onClose={() => setJob(null)} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
