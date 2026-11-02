"use client";
import { useCallback, useEffect, useState } from "react";
import DealModal from "./DealModal";
import Toast from "./Toast";

type Brand = { id: string; name: string; company: string | null; discount_pct: number; products: number; deals: number };
type Deal = { pct: number; customer: { id: string; code: string; name: string; route: string }; brand: { id: string; name: string; discount_pct: number } };

export default function DiscountsView() {
  const [tab, setTab] = useState<"brands" | "deals">("brands");
  const [toast, setToast] = useState("");
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="mb-2 text-lg font-bold lg:text-xl">Discounts</h1>
        <div className="flex gap-2">
          <button className={"chip " + (tab === "brands" ? "chip-on" : "")} onClick={() => setTab("brands")}>Brand discounts</button>
          <button className={"chip " + (tab === "deals" ? "chip-on" : "")} onClick={() => setTab("deals")}>Customer deals</button>
        </div>
      </header>
      <div className="p-3 lg:px-5">
        <p className="mb-3 text-sm text-muted">{tab === "brands" ? "Every invoice gives this discount on the brand's parts. A customer deal replaces it for that customer." : "A customer's own discount on a brand. It replaces the brand's normal discount on their invoices."}</p>
        {tab === "brands" ? <Brands onToast={setToast} /> : <Deals onToast={setToast} />}
      </div>
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function Brands({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<Brand[] | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/discounts/brands");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load brands");
    setRows(j.brands);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(b: Brand) {
    const v = edit[b.id];
    const r = await fetch("/api/discounts/brands/" + b.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pct: Number(v) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return onToast(j.error || "Could not save");
    setEdit((s) => { const n = { ...s }; delete n[b.id]; return n; });
    onToast(b.name + ": " + Number(v) + "%"); load();
  }
  const shown = (rows ?? []).filter((b) => !q.trim() || (b.name + " " + (b.company ?? "")).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      <input className="input mb-3 lg:max-w-sm" type="text" inputMode="search" placeholder="Find a brand" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a brand" />
      {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
      {rows && !rows.length && <p className="text-sm text-muted">No brands yet. Brands come with the product import or the product form.</p>}
      <ul className="grid gap-2 lg:grid-cols-2">
        {shown.map((b) => {
          const dirty = edit[b.id] !== undefined && Number(edit[b.id]) !== b.discount_pct;
          return (
            <li key={b.id} className="card p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{b.name}</p><p className="text-xs text-muted">{[b.company, b.products + " parts", b.deals ? b.deals + " customer deals" : ""].filter(Boolean).join(" · ")}</p></div>
                <div className="flex items-center gap-1">
                  <input className="input w-20 text-center font-semibold" type="number" inputMode="decimal" min="0" max="100" step="any" aria-label={"Discount percent for " + b.name}
                    value={edit[b.id] ?? String(b.discount_pct)} onChange={(e) => setEdit((s) => ({ ...s, [b.id]: e.target.value }))} /><span className="text-sm">%</span>
                </div>
                <button className="btn btn-primary min-h-11 px-3" disabled={!dirty} onClick={() => save(b)}>Save</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Deals({ onToast }: { onToast: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Deal[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"new" | Deal | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/discounts/deals?q=" + encodeURIComponent(q) + "&limit=100");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load deals");
    setError(""); setItems(j.items); setTotal(j.total);
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function remove(d: Deal) {
    if (!window.confirm("Remove " + d.customer.name + "'s deal on " + d.brand.name + "?")) return;
    const r = await fetch("/api/discounts/deals?customer=" + d.customer.id + "&brand=" + d.brand.id, { method: "DELETE" });
    if (!r.ok) return onToast("Could not remove the deal");
    onToast("Deal removed"); load();
  }
  return (
    <>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row">
        <button className="btn btn-primary lg:order-1" onClick={() => setModal("new")}>Add customer deal</button>
        <input className="input lg:max-w-sm" type="text" inputMode="search" placeholder="Find a customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a customer" />
      </div>
      {error && <p className="mb-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      {!items && !error && <p className="text-sm text-muted">Loading…</p>}
      {items && !items.length && <p className="text-sm text-muted">No customer deals {q ? "match" : "yet"}.</p>}
      <ul className="grid gap-2 lg:grid-cols-2">
        {items?.map((d) => (
          <li key={d.customer.id + d.brand.id} className="card p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{d.customer.name}</p><p className="text-xs text-muted">{[d.customer.code, d.customer.route].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-sm">{d.brand.name}: <b>{d.pct}%</b> <span className="text-xs text-muted">(normal {d.brand.discount_pct}%)</span></p></div>
              <div className="flex gap-2"><button className="btn min-h-9 px-3" onClick={() => setModal(d)}>Change</button><button className="btn min-h-9 px-3 text-red" onClick={() => remove(d)} aria-label="Remove deal">✕</button></div>
            </div>
          </li>
        ))}
      </ul>
      {items && total > items.length && <p className="mt-2 text-xs text-muted">Showing {items.length} of {total}. Search to narrow the list.</p>}
      {modal && <DealModal deal={modal === "new" ? null : { customer: { id: modal.customer.id, name: modal.customer.name }, brand_id: modal.brand.id, pct: modal.pct }} onClose={() => setModal(null)} onSaved={() => { setModal(null); onToast("Deal saved"); load(); }} />}
    </>
  );
}
