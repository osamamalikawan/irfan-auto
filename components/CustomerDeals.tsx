"use client";
import { useCallback, useEffect, useState } from "react";
import DealModal from "./DealModal";
import { useMe } from "./Me";
import Toast from "./Toast";

type Deal = { pct: number; brand: { id: string; name: string; discount_pct: number } };

/** On the customer profile: this customer's special brand discounts. */
export default function CustomerDeals({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { can } = useMe();
  const canEdit = can("sales.discount") || can("settings.edit");
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [modal, setModal] = useState<"new" | Deal | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/discounts/deals?customer=" + customerId + "&limit=200");
    const j = await r.json().catch(() => ({}));
    setDeals(r.ok ? j.items : []);
  }, [customerId]);
  useEffect(() => { load(); }, [load]);
  if (!deals) return null;

  async function remove(d: Deal) {
    if (!window.confirm("Remove the deal on " + d.brand.name + "?")) return;
    const r = await fetch("/api/discounts/deals?customer=" + customerId + "&brand=" + d.brand.id, { method: "DELETE" });
    if (r.ok) { setToast("Deal removed"); load(); }
  }
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 font-semibold">Special discounts</h2>{canEdit && <button className="btn min-h-9 px-3" onClick={() => setModal("new")}>Add</button>}</div>
      {!deals.length && <p className="text-sm text-muted">No special deals. This customer gets each brand&apos;s normal discount.</p>}
      <ul className="divide-y divide-line">
        {deals.map((d) => (
          <li key={d.brand.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1"><b>{d.brand.name}</b> <span className="text-xs text-muted">normal {d.brand.discount_pct}%</span></span>
            <b>{d.pct}%</b>
            {canEdit && <><button className="btn min-h-9 px-2" onClick={() => setModal(d)}>Change</button><button className="btn min-h-9 border-0 bg-transparent px-2 text-muted" onClick={() => remove(d)} aria-label={"Remove " + d.brand.name}>✕</button></>}
          </li>
        ))}
      </ul>
      {modal && <DealModal customer={{ id: customerId, name: customerName }} deal={modal === "new" ? null : { customer: { id: customerId, name: customerName }, brand_id: modal.brand.id, pct: modal.pct }} onClose={() => setModal(null)} onSaved={() => { setModal(null); setToast("Deal saved"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </section>
  );
}
