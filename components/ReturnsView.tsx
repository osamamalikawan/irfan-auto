"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import Toast from "./Toast";
import { Spinner } from "./Loading";

type Found = { id: string; no: string; customer_name: string; total: number; sale_date: string };
type Item = { id: string; name: string; sold: number; returned: number; remaining: number; net_unit: number };
type Ret = { id: string; no: string; return_date: string; amount: number; damaged: boolean; reason: string | null; by: string; sale: { id: string; no: string; customer_name: string } | null; lines: { qty: number; name: string }[] };

export default function ReturnsView() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [sale, setSale] = useState<{ id: string; no: string; customer_name: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [damaged, setDamaged] = useState(false);
  const [reason, setReason] = useState("");
  const [hist, setHist] = useState<Ret[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const loadHist = useCallback(() => { fetch("/api/returns").then((r) => r.json()).then((j) => setHist(j.items ?? [])).catch(() => {}); }, []);
  useEffect(() => { loadHist(); }, [loadHist]);

  useEffect(() => {
    if (sale) return;
    const t = setTimeout(async () => {
      const id = ++req.current;
      const r = await fetch("/api/sales?status=confirmed&limit=15&q=" + encodeURIComponent(q));
      const j = await r.json().catch(() => ({}));
      if (id === req.current && r.ok) setFound(j.items);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sale]);

  async function pick(s: { id: string; no: string; customer_name: string }) {
    setError("");
    const r = await fetch("/api/sales/" + s.id + "/returnable");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the invoice");
    setSale(s); setItems(j.items); setQty({}); setDamaged(false); setReason("");
  }

  const credit = items.reduce((x, i) => x + Math.round(Math.min(Number(qty[i.id]) || 0, i.remaining) * i.net_unit), 0);
  const lines = items.map((i) => ({ item_id: i.id, qty: Number(qty[i.id]) || 0 })).filter((l) => l.qty > 0);
  const tooMuch = items.some((i) => (Number(qty[i.id]) || 0) > i.remaining);

  async function save() {
    if (!sale) return;
    setBusy(true); setError("");
    const r = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sale_id: sale.id, lines, damaged, reason }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not record the return");
    setToast("Return recorded: " + rs(credit) + " credited"); setSale(null); setItems([]); setQ(""); loadHist();
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Returns</h1>
        <p className="text-sm text-muted">Find the invoice, choose what comes back, and the customer&apos;s account is credited.</p>
      </header>

      <div className="space-y-3 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">1. Find the invoice</h2>
          {sale ? (
            <div className="flex items-center gap-2"><div className="flex-1"><p className="font-semibold">{sale.no}</p><p className="text-sm text-muted">{sale.customer_name}</p></div><button className="btn min-h-9" onClick={() => setSale(null)}>Change</button></div>
          ) : (
            <>
              <input className="input mb-2" type="text" inputMode="search" placeholder="Invoice number or customer name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find invoice" />
              <ul className="divide-y divide-line">
                {found.map((s) => (
                  <li key={s.id}><button className="flex min-h-14 w-full items-center gap-2 py-2 text-left active:bg-bg" onClick={() => pick(s)}>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{s.no} · {s.customer_name}</span><span className="text-xs text-muted">{niceDate(s.sale_date)}</span></span>
                    <span className="font-semibold">{rs(s.total)}</span>
                  </button></li>
                ))}
              </ul>
              {!found.length && <p className="text-sm text-muted">No invoice matches.</p>}
            </>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">2. Items to return</h2>
          {!sale && <p className="text-sm text-muted">Choose an invoice first.</p>}
          {sale && (
            <>
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="py-2">
                    <p className="font-medium leading-snug">{i.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 text-xs text-muted">Sold {fmtQty(i.sold)} · returned {fmtQty(i.returned)} · left {fmtQty(i.remaining)} · {rs(i.net_unit)} each</span>
                      <input className="input w-24 text-center" type="number" inputMode="decimal" min="0" max={i.remaining} step="any" disabled={i.remaining <= 0} placeholder="0" value={qty[i.id] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [i.id]: e.target.value }))} aria-label={"Return quantity for " + i.name} />
                    </div>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} /> Goods are damaged (do not put back in stock)</label>
              <input className="input mt-2" maxLength={300} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
              <p className="mt-3 text-lg font-bold">Credit to customer: {rs(credit)}</p>
              {tooMuch && <p className="text-sm text-red">A quantity is more than is left to return.</p>}
              {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
              <button className="btn btn-primary mt-3 w-full" disabled={busy || !lines.length || tooMuch} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Record return"}</button>
            </>
          )}
          {!sale && error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
        </section>

        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Returns recorded</h2>
          {!hist.length && <p className="text-sm text-muted">No returns yet.</p>}
          <ul className="divide-y divide-line">
            {hist.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-2"><b>{r.no}</b><span className="text-xs text-muted">{niceDate(r.return_date)} · {r.sale?.no} · {r.sale?.customer_name}</span><span className="flex-1" />
                  <span className={"pill " + (r.damaged ? "bg-red-bg text-red" : "bg-green-bg text-green")}>{r.damaged ? "Damaged" : "Restocked"}</span><b>{rs(r.amount)}</b></div>
                <p className="text-xs text-muted">{r.lines.map((l) => fmtQty(l.qty) + " × " + l.name).join(", ")}{r.reason ? " — " + r.reason : ""}{r.by ? " · " + r.by : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
