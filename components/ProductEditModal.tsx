"use client";
import { useEffect, useState } from "react";
import SupplierPicks, { type SupplierOpt } from "./SupplierPicks";
import { Spinner } from "./Loading";

export type ProductMeta = {
  lists: { id: string; name: string; visible: boolean }[];
  companies: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  suppliers: SupplierOpt[];
};
export type ProductRow = {
  id: string; name_en: string; name_ur: string | null; code_name: string | null; scheme: string | null; cp: number; purchase_price: number; unit: string;
  reorder_level: number; list_id: string | null; list_name: string | null; company: string | null; brand: string | null; on_hand: number; suppliers: SupplierOpt[];
};

/** Edit the details of one product: names, company, brand, prices, list and suppliers. */
export default function ProductEditModal({ product, meta, onClose, onSaved }: { product: ProductRow; meta: ProductMeta; onClose: () => void; onSaved: (m: string) => void }) {
  const p = product;
  const [f, setF] = useState({
    name_en: p.name_en, name_ur: p.name_ur ?? "", code_name: p.code_name ?? "", company: p.company ?? "", brand: p.brand ?? "", list: p.list_name ?? "",
    scheme: p.scheme ?? "", cp: String(p.cp ?? ""), purchase_price: Number(p.purchase_price) ? String(p.purchase_price) : "", unit: p.unit ?? "pc", reorder_level: Number(p.reorder_level) ? String(p.reorder_level) : "",
  });
  const [sup, setSup] = useState<string[]>(p.suppliers.map((s) => s.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/inventory/products/" + p.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, supplier_ids: sup }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the product");
    onSaved(f.name_en.trim() + " saved");
  }

  const activeLists = meta.lists.filter((l) => l.visible);
  const listIsInactive = !!f.list && !activeLists.some((l) => l.name === f.list);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form role="dialog" aria-label="Edit product" onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Edit product</h2>
        <div className="mt-3 space-y-3">
          <div><label className="label" htmlFor="pe-name">Name (English) *</label><input id="pe-name" className="input" required value={f.name_en} onChange={set("name_en")} /></div>
          <div><label className="label" htmlFor="pe-ur">Name (Urdu)</label><input id="pe-ur" className="input ur" dir="rtl" value={f.name_ur} onChange={set("name_ur")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="pe-code">Code name</label><input id="pe-code" className="input" value={f.code_name} onChange={set("code_name")} /></div>
            <div><label className="label" htmlFor="pe-scheme">Scheme (e.g. 9+1)</label><input id="pe-scheme" className="input" value={f.scheme} onChange={set("scheme")} /></div>
            <div><label className="label" htmlFor="pe-company">Company</label><input id="pe-company" className="input" list="pe-dl-company" value={f.company} onChange={set("company")} /></div>
            <div><label className="label" htmlFor="pe-brand">Brand</label><input id="pe-brand" className="input" list="pe-dl-brand" value={f.brand} onChange={set("brand")} /></div>
            <div><label className="label" htmlFor="pe-cp">Counter price (CP)</label><input id="pe-cp" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.cp} onChange={set("cp")} /></div>
            <div><label className="label" htmlFor="pe-pp">Purchase price</label><input id="pe-pp" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.purchase_price} onChange={set("purchase_price")} /></div>
            <div><label className="label" htmlFor="pe-unit">Unit</label><input id="pe-unit" className="input" value={f.unit} onChange={set("unit")} /></div>
            <div><label className="label" htmlFor="pe-reorder">Reorder level</label><input id="pe-reorder" className="input" type="number" inputMode="decimal" min="0" step="any" value={f.reorder_level} onChange={set("reorder_level")} /></div>
          </div>
          <div>
            <label className="label" htmlFor="pe-list">List</label>
            <select id="pe-list" className="input" value={f.list} onChange={set("list")}>
              <option value="">No list</option>
              {activeLists.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              {meta.lists.filter((l) => !l.visible).length > 0 && (
                <optgroup label="Inactive lists (product leaves this page)">
                  {meta.lists.filter((l) => !l.visible).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
            {listIsInactive && <p className="mt-1 text-xs text-amber">This list is inactive. After saving, the product will no longer show on this page.</p>}
          </div>
          <div><span className="label">Suppliers</span><SupplierPicks options={meta.suppliers} value={sup} onChange={setSup} /></div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.name_en.trim()}>{busy ? <><Spinner /> Saving…</> : "Save"}</button>
        </div>
      </form>
      <datalist id="pe-dl-company">{meta.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="pe-dl-brand">{meta.brands.map((c) => <option key={c.id} value={c.name} />)}</datalist>
    </div>
  );
}
