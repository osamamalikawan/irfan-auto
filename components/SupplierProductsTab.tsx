"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { qty, rs } from "@/lib/format";
import { useMe } from "./Me";
import { ProductPicker } from "./InvoiceBuilder";
import { Spinner } from "./Loading";

export type LinkedProduct = {
  id: string; name_en: string; name_ur: string | null; code_name: string | null; unit: string; cp: number; purchase_price: number; reorder_level: number;
  active: boolean; brand: string | null; company: string | null; list: string | null; on_hand: number;
};

/** Load the products linked to a supplier. Shared with the purchase order tab. */
export function useLinkedProducts(supplierId: string) {
  const [items, setItems] = useState<LinkedProduct[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/suppliers/" + supplierId + "/products");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not load the products");
    setError(""); setItems(j.items);
  }, [supplierId]);
  useEffect(() => { load(); }, [load]);
  return { items, error, reload: load };
}

export default function SupplierProductsTab({ supplierId, onToast }: { supplierId: string; onToast: (m: string) => void }) {
  const { canAny } = useMe();
  const canLink = canAny(["suppliers.edit", "stock.manage"]);
  const { items, error, reload } = useLinkedProducts(supplierId);
  const [q, setQ] = useState("");
  const [low, setLow] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState("");

  async function link(productId: string) {
    setPicking(false);
    const r = await fetch("/api/suppliers/" + supplierId + "/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return onToast(j.error || "Could not link the product");
    onToast("Product linked"); reload();
  }
  async function unlink(p: LinkedProduct) {
    if (!window.confirm("Remove " + p.name_en + " from this supplier? The product itself is kept.")) return;
    setBusy(p.id);
    const r = await fetch("/api/suppliers/" + supplierId + "/products?product_id=" + p.id, { method: "DELETE" });
    setBusy("");
    if (!r.ok) return onToast("Could not remove the product");
    onToast("Removed"); reload();
  }

  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!items) return <p className="p-4 text-sm text-muted"><Spinner /> Loading products…</p>;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((p) => {
    if (low && !(p.reorder_level > 0 && p.on_hand <= p.reorder_level)) return false;
    const hay = [p.name_en, p.name_ur, p.code_name, p.brand, p.company].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="space-y-3 p-3 lg:px-5">
      <section className="card p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <input className="input lg:flex-1" type="text" inputMode="search" placeholder="Search these products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search linked products" />
          <button className={"chip " + (low ? "chip-on" : "")} aria-pressed={low} onClick={() => setLow((v) => !v)}>Low stock</button>
          {canLink && <button className="btn btn-primary" onClick={() => setPicking(true)}>＋ Link a product</button>}
        </div>
        <p className="mt-2 text-xs text-muted">{shown.length} of {items.length} linked products</p>
        {!items.length && <p className="mt-3 text-sm text-muted">No products are linked to this supplier yet. Link products here, or choose the supplier when you edit a product.</p>}
        <ul className="mt-2 divide-y divide-line">
          {shown.map((p) => {
            const lowStock = p.reorder_level > 0 && p.on_hand <= p.reorder_level;
            return (
              <li key={p.id} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={"/inventory/" + p.id} className="font-medium leading-snug hover:underline">{p.name_en}</Link>
                  {p.name_ur && <p className="ur text-sm text-muted">{p.name_ur}</p>}
                  <p className="text-xs text-muted">{[p.company, p.brand, p.list].filter(Boolean).join(" · ") || "—"}</p>
                  {!p.active && <span className="pill bg-bg text-muted">Inactive</span>}
                </div>
                <div className="shrink-0 text-right text-sm">
                  <span className={"pill " + (p.on_hand <= 0 ? "bg-red-bg text-red" : lowStock ? "bg-amber-bg text-amber" : "bg-green-bg text-green")}>{qty(p.on_hand)} {p.unit}</span>
                  <p className="mt-1 text-xs text-muted">{p.purchase_price > 0 ? "Last cost " + rs(p.purchase_price) : "No cost yet"}</p>
                </div>
                {canLink && <button className="btn min-h-8 border-0 bg-transparent px-2 text-muted" disabled={busy === p.id} onClick={() => unlink(p)} aria-label={"Remove " + p.name_en}>✕</button>}
              </li>
            );
          })}
        </ul>
      </section>
      {picking && <ProductPicker allowNoPrice onAdd={(p) => link(p.id)} inInvoice={Object.fromEntries(items.map((i) => [i.id, 1]))} onClose={() => setPicking(false)} />}
    </div>
  );
}
