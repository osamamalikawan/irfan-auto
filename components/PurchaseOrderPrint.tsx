"use client";
import { useEffect, useState } from "react";
import { BUSINESS } from "@/lib/business";
import { niceDate } from "@/lib/dates";

type Order = { no: string; po_date: string; expected_date: string | null; supplier_name: string; status: string; total: number; remarks: string | null;
  supplier: { code: string; phone: string | null; phone2: string | null; address: string | null; city: string | null } | null };
type Item = { id: string; line_no: number; name: string; unit: string; qty: number; cost: number };
const n = (x: number | string) => Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A4 purchase order to send to the supplier. */
export default function PurchaseOrderPrint({ id }: { id: string }) {
  const [d, setD] = useState<{ order: Order; items: Item[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/purchase-orders/" + id).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load the purchase order"); setD(j); }).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!d) return <p className="p-4 text-muted">Preparing…</p>;
  const { order: o, items } = d;
  const phones = [o.supplier?.phone, o.supplier?.phone2].filter(Boolean).join(" / ");
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="btn" onClick={() => window.close()}>Close</button>
      </div>
      <header className="flex items-start justify-between border-b-2 border-black pb-2">
        <div><h1 className="text-xl font-bold">{BUSINESS.name}</h1><p className="text-xs">{BUSINESS.address}</p><p className="text-xs">{BUSINESS.phone}</p></div>
        <div className="text-right"><h2 className="text-lg font-bold">PURCHASE ORDER</h2><p className="text-sm">{o.no}</p><p className="text-xs">Date: {niceDate(o.po_date)}</p>{o.expected_date && <p className="text-xs">Expected: {niceDate(o.expected_date)}</p>}</div>
      </header>
      <section className="my-3 text-sm">
        <p className="text-xs uppercase text-gray-600">To</p>
        <p className="font-semibold">{o.supplier_name}</p>
        {o.supplier?.address && <p>{[o.supplier.address, o.supplier.city].filter(Boolean).join(", ")}</p>}
        {phones && <p>{phones}</p>}
      </section>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-y border-black text-left"><th className="w-10 py-1">#</th><th className="py-1">Item</th><th className="py-1">Unit</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Amount</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-gray-300"><td className="py-1">{i.line_no}</td><td className="py-1">{i.name}</td><td className="py-1">{i.unit}</td><td className="py-1 text-right">{n(i.qty)}</td><td className="py-1 text-right">{Number(i.cost) > 0 ? n(i.cost) : "—"}</td><td className="py-1 text-right">{Number(i.cost) > 0 ? n(Number(i.qty) * Number(i.cost)) : "—"}</td></tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t-2 border-black font-bold"><td colSpan={5} className="py-1.5 text-right">Total</td><td className="py-1.5 text-right">Rs {n(o.total)}</td></tr></tfoot>
      </table>
      {o.remarks && <p className="mt-3 text-sm"><b>Remarks:</b> {o.remarks}</p>}
      <div className="mt-16 flex justify-between text-xs"><span className="border-t border-black px-6 pt-1">Prepared by</span><span className="border-t border-black px-6 pt-1">Authorised signature</span></div>
    </div>
  );
}
