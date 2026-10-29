"use client";
import { useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty } from "@/lib/format";

type Detail = {
  sale: { id: string; no: string; sale_date: string; customer_name: string; remarks: string | null };
  customer: { phone: string | null; address: string | null; area: { name: string } | null; route: { name: string } | null } | null;
  items: { id: string; name: string; qty: number; free: number; allocs: { qty: number; location: string; racks: string[] }[] }[];
};

/** Warehouse pick vouchers: one per invoice, no prices. thermal = 80 mm roll, a4 = sheets. */
export default function DispatchPrint({ ids, mode }: { ids: string[]; mode: "thermal" | "a4" }) {
  const [docs, setDocs] = useState<Detail[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const all = await Promise.all(ids.map(async (id) => {
          const r = await fetch("/api/sales/" + id);
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not load " + id);
          return j as Detail;
        }));
        setDocs(all);
        await fetch("/api/dispatch/printed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        setTimeout(() => window.print(), 400);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [ids]);

  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!docs) return <p className="p-4 text-muted">Preparing vouchers…</p>;
  const thermal = mode === "thermal";
  return (
    <div className={thermal ? "mx-auto w-[72mm] text-[12px]" : "mx-auto max-w-[190mm] text-sm"}>
      <style>{`@page { size: ${thermal ? "80mm auto" : "A4"}; margin: ${thermal ? "3mm" : "10mm"}; } @media print { body { background: #fff !important; } }`}</style>
      <div data-noprint className="flex gap-2 p-3"><button className="btn btn-primary" onClick={() => window.print()}>Print again</button><button className="btn" onClick={() => window.close()}>Close</button></div>
      {docs.map((d) => (
        <section key={d.sale.id} className="mb-6 border-b border-dashed border-black pb-4 text-black" style={{ breakAfter: thermal ? "auto" : "page" }}>
          <p className="text-center text-base font-bold">Irfan Autos</p>
          <p className="mb-2 text-center">DISPATCH VOUCHER</p>
          <p className="flex justify-between"><b>{d.sale.no}</b><span>{niceDate(d.sale.sale_date)}</span></p>
          <p className="font-semibold">{d.sale.customer_name}</p>
          <p>{[d.customer?.area?.name, d.customer?.route?.name, d.customer?.phone].filter(Boolean).join(" · ")}</p>
          {d.customer?.address && <p>{d.customer.address}</p>}
          <table className="mt-2 w-full border-collapse">
            <thead><tr className="border-b border-black text-left"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th></tr></thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-b border-dotted border-black align-top">
                  <td className="py-1">{i.name}<br /><span className="text-[11px]">{i.allocs.map((a) => a.location + (a.racks.length ? " rack " + a.racks.join(", ") : "") + " × " + fmtQty(a.qty)).join(" | ")}</span></td>
                  <td className="py-1 text-right font-semibold">{fmtQty(i.qty)}{Number(i.free) > 0 ? " +" + fmtQty(i.free) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right font-semibold">{d.items.length} items · {fmtQty(d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0))} pieces</p>
          {d.sale.remarks && <p className="mt-1">Remarks: {d.sale.remarks}</p>}
          <p className="mt-6 flex justify-between text-[11px]"><span>Packed by: ________</span><span>Checked by: ________</span></p>
        </section>
      ))}
    </div>
  );
}
