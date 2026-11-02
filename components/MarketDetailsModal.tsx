"use client";
import { useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";

export type MarketInfo = { cost: number; vendor: string; supplier_id?: string };
type Sup = { id: string; name: string };

/** Details for one part bought from the market: what it cost us and which supplier it came from. */
export default function MarketDetailsModal({ title, qty, price, initial, onSave, onClose }: {
  title: string; qty: number; price: number; initial?: MarketInfo; onSave: (m: MarketInfo) => void; onClose: () => void;
}) {
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [supplier, setSupplier] = useState(initial?.supplier_id ?? "");
  const [suppliers, setSuppliers] = useState<Sup[]>([]);
  const [error, setError] = useState("");
  const costRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/suppliers/options").then((r) => r.json()).then((j) => setSuppliers(j.suppliers ?? [])).catch(() => {});
    costRef.current?.focus();
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);

  const c = Number(cost);
  function save() {
    if (!Number.isFinite(c) || c <= 0) return setError("Enter the cost price per piece.");
    onSave({ cost: c, supplier_id: supplier || undefined, vendor: suppliers.find((s) => s.id === supplier)?.name ?? "" });
  }
  const profit = (price - c) * qty;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Market purchase details" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h2 className="text-base font-semibold">Market purchase</h2>
        <p className="mb-3 text-sm text-muted">{title} · {qty} pc · sold at {rs(price)}</p>
        <label className="label" htmlFor="mk-cost">Cost price per piece (Rs)</label>
        <input id="mk-cost" ref={costRef} className="input text-lg font-semibold" inputMode="decimal" value={cost} onChange={(e) => { setCost(e.target.value.replace(/[^\d.]/g, "")); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("mk-sup")?.focus(); } }} />
        <label className="label mt-3" htmlFor="mk-sup">Supplier</label>
        <select id="mk-sup" className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}>
          <option value="">No supplier</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {c > 0 && <p className={"mt-3 text-sm " + (profit < 0 ? "text-red" : "text-green")}>{profit < 0 ? "Loss" : "Profit"} on this line: <b>{rs(Math.abs(profit))}</b></p>}
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel <kbd className="ml-1 text-[11px] text-muted">Esc</kbd></button><button className="btn btn-primary" onClick={save}>Save <kbd className="ml-1 text-[11px]">Enter</kbd></button></div>
      </div>
    </div>
  );
}
