"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty, rs } from "@/lib/format";
import { useMe } from "./Me";
import { ProductPicker, type Prod } from "./InvoiceBuilder";
import { useLinkedProducts, type LinkedProduct } from "./SupplierProductsTab";
import { Spinner } from "./Loading";

type Order = { id: string; no: string; po_date: string; expected_date: string | null; status: "open" | "received" | "cancelled"; total: number; items: number };
type Line = { qty: string; cost: string };
const num = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const tone: Record<Order["status"], string> = { open: "bg-amber-bg text-amber", received: "bg-green-bg text-green", cancelled: "bg-bg text-muted" };

/** Suggested order quantity: enough to get back to twice the reorder level. */
const suggest = (p: LinkedProduct) => (p.reorder_level > 0 && p.on_hand <= p.reorder_level ? Math.max(Math.ceil(p.reorder_level * 2 - p.on_hand), 1) : 0);

export default function SupplierOrdersTab({ supplierId, active, onToast }: { supplierId: string; active: boolean; onToast: (m: string) => void }) {
  const { can } = useMe();
  const canMake = can("purchases.create") && active;
  const { items: linked, error: linkErr } = useLinkedProducts(supplierId);
  const [extra, setExtra] = useState<LinkedProduct[]>([]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [expected, setExpected] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);

  const loadOrders = useCallback(async () => {
    const r = await fetch("/api/purchase-orders?supplier=" + supplierId + "&limit=50");
    const j = await r.json().catch(() => ({}));
    if (r.ok) setOrders(j.items);
  }, [supplierId]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const all = [...(linked ?? []), ...extra.filter((e) => !(linked ?? []).some((l) => l.id === e.id))];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((p) => { const hay = [p.name_en, p.name_ur, p.code_name, p.brand, p.company].filter(Boolean).join(" ").toLowerCase(); return words.every((w) => hay.includes(w)); });
  const chosen = all.filter((p) => lines[p.id]);
  const total = chosen.reduce((s, p) => s + num(lines[p.id].qty) * num(lines[p.id].cost), 0);
  const ready = canMake && chosen.length > 0 && chosen.every((p) => num(lines[p.id].qty) > 0) && !busy;

  const toggle = (p: LinkedProduct) => setLines((l) => {
    const n = { ...l };
    if (n[p.id]) delete n[p.id]; else n[p.id] = { qty: String(suggest(p) || 1), cost: p.purchase_price > 0 ? String(p.purchase_price) : "" };
    return n;
  });
  const setLine = (id: string, patch: Partial<Line>) => setLines((l) => ({ ...l, [id]: { ...l[id], ...patch } }));
  const pickLow = () => setLines((l) => {
    const n = { ...l };
    for (const p of all) { const s = suggest(p); if (s > 0 && !n[p.id]) n[p.id] = { qty: String(s), cost: p.purchase_price > 0 ? String(p.purchase_price) : "" }; }
    return n;
  });
  async function addOther(p: Prod) {
    setPicking(false);
    const r = await fetch("/api/inventory/products/" + p.id).then((x) => x.json()).catch(() => null);
    const pp = Number(r?.product?.purchase_price ?? 0);
    const row: LinkedProduct = { id: p.id, name_en: p.name_en, name_ur: p.name_ur, code_name: p.code_name, unit: p.unit, cp: p.cp, purchase_price: pp, reorder_level: Number(r?.product?.reorder_level ?? 0), active: true, brand: null, company: null, list: p.list_name ?? null, on_hand: Number(p.on_hand) };
    setExtra((e) => (e.some((x) => x.id === p.id) ? e : [...e, row]));
    setLines((l) => ({ ...l, [p.id]: l[p.id] ?? { qty: "1", cost: pp > 0 ? String(pp) : "" } }));
  }

  async function generate() {
    setBusy(true); setError("");
    const body = { supplier_id: supplierId, expected_date: expected, remarks, lines: chosen.map((p) => ({ product_id: p.id, qty: num(lines[p.id].qty), cost: num(lines[p.id].cost) })) };
    const r = await fetch("/api/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not create the purchase order");
    setLines({}); setRemarks(""); setExpected(""); setExtra([]);
    onToast("Purchase order created"); loadOrders();
    window.open("/print/po?id=" + j.id, "_blank");
  }
  async function setStatus(o: Order, status: Order["status"]) {
    if (status === "cancelled" && !window.confirm("Cancel " + o.no + "?")) return;
    const r = await fetch("/api/purchase-orders/" + o.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!r.ok) return onToast("Could not change the status");
    loadOrders();
  }

  return (
    <div className="space-y-3 p-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">New purchase order</h2>
          {canMake && <button className="btn min-h-9 px-3" onClick={() => setPicking(true)}>＋ Other product</button>}
        </div>
        {!active && <p className="mb-2 rounded-lg bg-amber-bg p-2 text-sm text-amber">This supplier is archived. Make them active to create a purchase order.</p>}
        {linkErr && <p className="text-sm text-red">{linkErr}</p>}
        {!linked ? <p className="text-sm text-muted"><Spinner /> Loading products…</p> : (
          <>
            <div className="flex gap-2">
              <input className="input" type="text" inputMode="search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products to order" />
              {canMake && <button className="btn shrink-0" onClick={pickLow}>Add low stock</button>}
            </div>
            {!all.length && <p className="mt-3 text-sm text-muted">No products are linked to this supplier. Use the Products tab to link some, or add one with “Other product”.</p>}
            <ul className="mt-2 max-h-[28rem] divide-y divide-line overflow-auto">
              {shown.map((p) => {
                const on = !!lines[p.id];
                return (
                  <li key={p.id} className="py-2.5">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1 size-4" checked={on} disabled={!canMake} onChange={() => toggle(p)} aria-label={"Order " + p.name_en} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{p.name_en}</p>
                        <p className="text-xs text-muted">Stock {qty(p.on_hand)} {p.unit}{p.reorder_level > 0 ? " · reorder at " + qty(p.reorder_level) : ""}</p>
                      </div>
                    </div>
                    {on && (
                      <div className="mt-2 grid grid-cols-3 items-end gap-2 pl-6">
                        <div><label className="label" htmlFor={"pq" + p.id}>Quantity</label><input id={"pq" + p.id} className="input text-center font-semibold" type="number" inputMode="decimal" min="0" step="any" value={lines[p.id].qty} onChange={(e) => setLine(p.id, { qty: e.target.value })} /></div>
                        <div><label className="label" htmlFor={"pc" + p.id}>Rate (Rs)</label><input id={"pc" + p.id} className="input text-center" type="number" inputMode="decimal" min="0" step="any" value={lines[p.id].cost} onChange={(e) => setLine(p.id, { cost: e.target.value })} /></div>
                        <p className="pb-2 text-right font-semibold">{rs(num(lines[p.id].qty) * num(lines[p.id].cost))}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="po-exp">Expected on</label><input id="po-exp" className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
              <div><label className="label" htmlFor="po-rem">Remarks</label><input id="po-rem" className="input" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <p className="flex-1 text-sm text-muted">{chosen.length} item(s) · <b className="text-ink">{rs(total)}</b></p>
              <button className="btn btn-primary" disabled={!ready} onClick={generate}>{busy ? <><Spinner /> Saving…</> : "Generate purchase order"}</button>
            </div>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Purchase orders</h2>
        {!orders && <p className="text-sm text-muted"><Spinner /> Loading…</p>}
        {orders && !orders.length && <p className="text-sm text-muted">No purchase orders yet.</p>}
        <ul className="divide-y divide-line">
          {orders?.map((o) => (
            <li key={o.id} className="py-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.no} <span className={"pill ml-1 " + tone[o.status]}>{o.status}</span></p>
                  <p className="text-xs text-muted">{niceDate(o.po_date)} · {o.items} item(s){o.expected_date ? " · expected " + niceDate(o.expected_date) : ""}</p>
                </div>
                <span className="font-semibold">{rs(o.total)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Link href={"/print/po?id=" + o.id} target="_blank" className="btn min-h-8 px-2 text-[13px]">Print / PDF</Link>
                {can("purchases.create") && o.status === "open" && <>
                  <Link href={"/purchases/new?supplier=" + supplierId} className="btn min-h-8 px-2 text-[13px]">Record purchase</Link>
                  <button className="btn min-h-8 px-2 text-[13px]" onClick={() => setStatus(o, "received")}>Mark received</button>
                  <button className="btn min-h-8 px-2 text-[13px]" onClick={() => setStatus(o, "cancelled")}>Cancel</button>
                </>}
                {can("purchases.create") && o.status !== "open" && <button className="btn min-h-8 px-2 text-[13px]" onClick={() => setStatus(o, "open")}>Reopen</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {picking && <ProductPicker allowNoPrice onAdd={addOther} inInvoice={Object.fromEntries(chosen.map((c) => [c.id, num(lines[c.id].qty)]))} onClose={() => setPicking(false)} />}
    </div>
  );
}
