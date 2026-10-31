"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import { useMe } from "./Me";
import PaySupplierModal from "./PaySupplierModal";
import Toast from "./Toast";
import { PageLoading } from "./Loading";

type Detail = {
  purchase: { id: string; no: string; purchase_date: string; supplier_id: string; supplier_name: string; supplier_inv_no: string | null; supplier_inv_date: string | null; discount: number; line_discount: number; freight: number; total: number; paid: number; remarks: string | null; status: string };
  supplier: { id: string; code: string; name: string; phone: string | null } | null; location: string;
  items: { id: string; name: string; qty: number; free: number; cost: number; disc_pct: number; line_disc: number }[];
  payments: { id: string; no: number; amount: number; method: string; ref_no: string | null; reversed: boolean }[];
};

export default function PurchaseView({ id }: { id: string }) {
  const { can } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/purchases/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the purchase");
    setD(j);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    if (!window.confirm("Cancel this purchase? The goods come out of stock and the supplier's account is corrected.")) return;
    setBusy(true);
    const r = await fetch("/api/purchases/" + id + "/cancel", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setToast(j.error || "Could not cancel");
    setToast("Purchase cancelled"); load();
  }
  async function openPay() {
    if (!d?.supplier) return;
    const r = await fetch("/api/suppliers/" + d.supplier.id);
    const j = await r.json();
    if (r.ok) setPay(Number(j.supplier.balance));
  }

  if (error) return <p className="p-4 text-red">{error} <Link href="/purchases" className="underline">Back</Link></p>;
  if (!d) return <PageLoading />;
  const { purchase: p } = d;
  const due = p.status === "confirmed" ? Number(p.total) - Number(p.paid) : 0;

  return (
    <div>
      <header data-noprint className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/purchases" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{p.no}</h1>
        {p.status === "cancelled" ? <span className="pill bg-bg text-muted">Cancelled</span> : due > 0 ? <span className="pill bg-amber-bg text-amber">Owed {rs(due)}</span> : <span className="pill bg-green-bg text-green">Paid</span>}
      </header>
      <div className="space-y-3 p-3 lg:max-w-3xl lg:px-5">
        <section className="card p-4">
          <p className="text-lg font-semibold">{p.supplier_name}</p>
          <p className="text-sm text-muted">{[d.supplier?.code, niceDate(p.purchase_date), "received at " + d.location].filter(Boolean).join(" · ")}</p>
          {(p.supplier_inv_no || p.supplier_inv_date) && <p className="text-sm text-muted">Supplier bill {p.supplier_inv_no ?? ""}{p.supplier_inv_date ? " dated " + niceDate(p.supplier_inv_date) : ""}</p>}
        </section>
        <section className="card p-4">
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1"><p className="font-medium leading-snug">{i.name}</p>
                  <p className="text-xs text-muted">{fmtQty(i.qty)} × {rs(i.cost)}{Number(i.disc_pct) > 0 ? " − " + i.disc_pct + "%" : ""}{Number(i.free) > 0 ? " · +" + fmtQty(i.free) + " free" : ""}</p></div>
                <p className="font-semibold">{rs(i.qty * i.cost - i.line_disc)}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(d.items.reduce((x, i) => x + i.qty * i.cost, 0))}</dd></div>
            {Number(p.line_discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Item discounts</dt><dd>− {rs(p.line_discount)}</dd></div>}
            {Number(p.discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Bill discount</dt><dd>− {rs(p.discount)}</dd></div>}
            {Number(p.freight) > 0 && <div className="flex justify-between"><dt className="text-muted">Freight</dt><dd>+ {rs(p.freight)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold"><dt>Total</dt><dd>{rs(p.total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{rs(p.paid)}</dd></div>
            {due > 0 && <div className="flex justify-between font-semibold text-amber"><dt>Still owed on this purchase</dt><dd>{rs(due)}</dd></div>}
          </dl>
          {d.payments.map((x) => <p key={x.id} className="mt-1 text-xs text-muted">Payment SP-{String(x.no).padStart(4, "0")}: {rs(x.amount)} ({x.method}{x.ref_no ? " " + x.ref_no : ""}){x.reversed ? " · reversed" : ""}</p>)}
          {p.remarks && <p className="mt-2 text-sm text-muted">Remarks: {p.remarks}</p>}
        </section>
        <div data-noprint className="grid grid-cols-2 gap-2 lg:flex">
          <button className="btn" onClick={() => window.print()}>Print</button>
          {can("suppliers.pay") && p.status === "confirmed" && d.supplier && <button className="btn btn-primary" onClick={openPay}>Pay supplier</button>}
          {can("purchases.cancel") && p.status === "confirmed" && <button className="btn text-red" disabled={busy} onClick={cancel}>Cancel purchase</button>}
          {d.supplier && <Link href={"/suppliers/" + d.supplier.id} className="btn">Supplier</Link>}
        </div>
      </div>
      {pay !== null && d.supplier && <PaySupplierModal supplier={{ id: d.supplier.id, name: d.supplier.name }} balance={pay} onClose={() => setPay(null)} onDone={(m) => { setPay(null); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
