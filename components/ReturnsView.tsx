"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import Toast from "./Toast";
import { Spinner } from "./Loading";

type Found = { id: string; no: string; customer_name: string; total: number; sale_date: string };
type Item = { id: string; name: string; sold: number; returned: number; remaining: number; net_unit: number };
type Ret = { id: string; no: string; kind?: string; return_date: string; amount: number; damaged: boolean; reason: string | null; by: string; customer_name?: string; sale: { id: string; no: string; customer_name: string } | null; lines: { qty: number; name: string }[] };

export default function ReturnsView({ initialSale, initialKind = "return" }: { initialSale?: string; initialKind?: "return" | "claim" }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [sale, setSale] = useState<{ id: string; no: string; customer_name: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"return" | "claim">(initialKind);
  const [damaged, setDamaged] = useState(false);
  const [reason, setReason] = useState("");
  const [hist, setHist] = useState<Ret[]>([]);
  const [histQuery, setHistQuery] = useState("");
  const [histPage, setHistPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const req = useRef(0);

  const loadHist = useCallback(() => { fetch("/api/returns").then((r) => r.json()).then((j) => { setHist(j.items ?? []); setHistPage(0); }).catch(() => {}); }, []);
  useEffect(() => { loadHist(); }, [loadHist]);

  useEffect(() => {
    if (sale) return;
    const t = setTimeout(async () => {
      const id = ++req.current;
      const r = await fetch("/api/sales?status=returnable&limit=15&q=" + encodeURIComponent(q));
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

  // opened from an invoice: go straight to its items
  const preset = useRef(false);
  useEffect(() => {
    if (!initialSale || preset.current) return;
    preset.current = true;
    fetch("/api/sales/" + initialSale).then((r) => r.json()).then((j) => { if (j.sale) pick({ id: j.sale.id, no: j.sale.no, customer_name: j.sale.customer_name }); else setError(j.error || "Invoice not found"); }).catch(() => setError("Could not load the invoice"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const credit = items.reduce((x, i) => x + Math.round(Math.min(Number(qty[i.id]) || 0, i.remaining) * i.net_unit), 0);
  const lines = items.map((i) => ({ item_id: i.id, qty: Number(qty[i.id]) || 0 })).filter((l) => l.qty > 0);
  const tooMuch = items.some((i) => (Number(qty[i.id]) || 0) > i.remaining);
  const matchingHist = hist.filter((r) => `${r.no} ${r.customer_name ?? ""} ${r.reason ?? ""}`.toLowerCase().includes(histQuery.trim().toLowerCase()));
  const histPageSize = 100;
  const histPageCount = Math.max(1, Math.ceil(matchingHist.length / histPageSize));
  const visibleHist = matchingHist.slice(histPage * histPageSize, (histPage + 1) * histPageSize);

  async function save() {
    if (!sale) return;
    setBusy(true); setError("");
    const r = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sale_id: sale.id, lines, kind, damaged: kind === "claim" || damaged, reason }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not record the " + kind);
    setToast((kind === "claim" ? "Claim" : "Return") + " recorded: " + rs(credit) + " credited"); setSale(null); setItems([]); setQ(""); loadHist();
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Returns and claims</h1>
        <p className="text-sm text-muted">Only delivered or completed orders can be returned or claimed. Find the invoice, choose what comes back, and the customer&apos;s account is credited.</p>
        <div role="radiogroup" aria-label="Return or claim" className="mt-2 flex gap-2">
          {([["return", "Return (R-)"], ["claim", "Claim (C:)"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={"chip " + (kind === k ? "chip-on" : "")} onClick={() => setKind(k)}>{l}</button>)}
        </div>
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
          <h2 className="mb-2 font-semibold">2. Items to {kind === "claim" ? "claim" : "return"}</h2>
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
              <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={kind === "claim" || damaged} disabled={kind === "claim"} onChange={(e) => setDamaged(e.target.checked)} /> {kind === "claim" ? "Claimed goods are not put back in stock" : "Goods are damaged (do not put back in stock)"}</label>
              <input className="input mt-2" maxLength={300} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
              <p className="mt-3 text-lg font-bold">Credit to customer: {rs(credit)}</p>
              {tooMuch && <p className="text-sm text-red">A quantity is more than is left to return.</p>}
              {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
              <button className="btn btn-primary mt-3 w-full" disabled={busy || !lines.length || tooMuch} onClick={save}>{busy ? <><Spinner /> Saving…</> : kind === "claim" ? "Record claim" : "Record return"}</button>
            </>
          )}
          {!sale && error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
        </section>

        <section className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="font-semibold">Returns and claims recorded ({matchingHist.length})</h2>
            <input className="input ml-auto max-w-xs" type="search" value={histQuery} onChange={(e) => { setHistQuery(e.target.value); setHistPage(0); }} placeholder="Find invoice or customer" aria-label="Find a recorded return" />
          </div>
          {!matchingHist.length && <p className="text-sm text-muted">{hist.length ? "No returns match." : "Nothing recorded yet."}</p>}
          <ul className="divide-y divide-line">
            {visibleHist.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-2"><b>{r.no}</b>{r.kind === "claim" && <span className="pill border border-amber bg-amber-bg text-amber">Claim</span>}<span className="text-xs text-muted">{niceDate(r.return_date)} · {r.sale ? `${r.sale.no} · ${r.sale.customer_name}` : `Original invoice not linked · ${r.customer_name ?? ""}`}</span><span className="flex-1" />
                  {r.no.startsWith("OLD-RET-")
                    ? <span className="pill bg-bg text-muted">Historical · stock unchanged</span>
                    : <span className={"pill " + (r.damaged ? "bg-red-bg text-red" : "bg-green-bg text-green")}>{r.damaged ? "Damaged" : "Restocked"}</span>}
                  <b>{rs(r.amount)}</b></div>
                <p className="text-xs text-muted">{r.lines.map((l) => fmtQty(l.qty) + " × " + l.name).join(", ")}{r.reason ? " — " + r.reason : ""}{r.by ? " · " + r.by : ""}</p>
              </li>
            ))}
          </ul>
          {matchingHist.length > histPageSize && <div className="mt-3 flex items-center justify-end gap-3 text-sm">
            <span className="text-muted">Page {histPage + 1} of {histPageCount}</span>
            <button type="button" className="btn min-h-9" disabled={histPage === 0} onClick={() => setHistPage((page) => page - 1)}>Previous</button>
            <button type="button" className="btn min-h-9" disabled={histPage + 1 >= histPageCount} onClick={() => setHistPage((page) => page + 1)}>Next</button>
          </div>}
        </section>
      </div>
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
