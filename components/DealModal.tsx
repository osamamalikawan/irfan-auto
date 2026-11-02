"use client";
import { useEffect, useState } from "react";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";

type Brand = { id: string; name: string; company: string | null; discount_pct: number };
const OVERLAY = "fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center";

/** Add or change a customer's special discount on a brand. */
export default function DealModal({ customer: fixed, deal, onClose, onSaved }: {
  customer?: PickedCustomer | null; deal?: { customer: PickedCustomer; brand_id: string; pct: number } | null; onClose: () => void; onSaved: () => void;
}) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(fixed ?? deal?.customer ?? null);
  const [picking, setPicking] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState(deal?.brand_id ?? "");
  const [pct, setPct] = useState(deal ? String(deal.pct) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const brand = brands.find((b) => b.id === brandId);
  const n = Number(pct);

  useEffect(() => { fetch("/api/discounts/brands").then((r) => r.json()).then((j) => setBrands(j.brands ?? [])).catch(() => setError("Could not load brands")); }, []);

  async function save() {
    if (!customer) return;
    setBusy(true); setError("");
    const r = await fetch("/api/discounts/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customer.id, brand_id: brandId, pct: n }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the deal");
    onSaved();
  }
  return (
    <div className={OVERLAY} onClick={onClose}>
      <div role="dialog" aria-label="Customer discount" onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">Special discount for a customer</h2>
        <div className="mb-3">
          <p className="label">Customer</p>
          {customer ? <div className="flex items-center gap-2"><p className="min-w-0 flex-1 font-medium">{customer.name}</p>{!fixed && !deal && <button className="btn min-h-9 px-3" onClick={() => setPicking(true)}>Change</button>}</div>
            : <button className="btn w-full" onClick={() => setPicking(true)}>Choose customer</button>}
        </div>
        <label className="label" htmlFor="dl-brand">Brand</label>
        <select id="dl-brand" className="input" value={brandId} disabled={!!deal} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Choose a brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.company ? " (" + b.company + ")" : ""}</option>)}
        </select>
        <label className="label mt-3" htmlFor="dl-pct">Discount for this customer (%)</label>
        <input id="dl-pct" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" max="100" step="any" autoFocus value={pct} onChange={(e) => setPct(e.target.value)} />
        {brand && <p className="mt-1 text-sm text-muted">Everyone else gets {brand.discount_pct}% on {brand.name}.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!customer || !brandId || !(n >= 0 && n <= 100 && pct !== "") || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
      </div>
      {picking && <div onClick={(e) => e.stopPropagation()}><CustomerPicker onPick={(c) => { setCustomer(c); setPicking(false); }} onClose={() => setPicking(false)} /></div>}
    </div>
  );
}
