"use client";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS } from "@/lib/business";
import { saleKind } from "@/lib/sale-types";

type Item = {
  id: string; name: string; name_ur: string | null; code_name: string | null; brand: string | null; qty: number; free: number; price: number; disc_pct: number; line_disc: number;
  allocs: { qty: number; location: string; racks: string[] }[];
};
type Detail = {
  sale: {
    id: string; no: string; sale_date: string; customer_name: string; remarks: string | null; status: string; total: number; paid: number; discount: number; line_discount: number;
    bilti: number; local_charges: number; sale_kind: string; pay_term: string; contact_phone: string | null;
  };
  customer: { name: string; name_ur: string | null; phone: string | null; address: string | null; is_walk_in: boolean; area: { name: string } | null; route: { name: string } | null } | null;
  items: Item[]; payments: { method: string; amount: number }[]; prev_balance: number; final_balance: number;
};
export type PrintType = "invoice" | "gateout" | "delivery";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return d + "-" + MONTHS[Number(m) - 1] + "-" + y.slice(2); };
const n = (x: number | string) => Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 });
const stamp = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return p.day + "-" + MONTHS[Number(p.month) - 1] + "-" + p.year + " " + p.hour + ":" + p.minute;
};
const urdu: React.CSSProperties = { fontFamily: "var(--font-urdu), serif", direction: "rtl", lineHeight: 1.9 };
const qtyOf = (i: Item) => n(i.qty) + (Number(i.free) > 0 ? "+" + n(i.free) : "");
const termLabel = (s: Detail["sale"]) => { const k = saleKind(s).key; return k === "counter" ? "Counter Sale" : k === "cash" ? "On Cash" : "On Credit"; };

/** Product on every slip: (brand)(code) and the Urdu name. The English name is used only when there is no Urdu name. */
function ProductName({ i, size = "text-[13px]" }: { i: Item; size?: string }) {
  const meta = (i.brand ? "(" + i.brand + ")" : "") + (i.code_name ? "(" + i.code_name + ")" : "");
  return (
    <div className={"flex flex-wrap items-baseline justify-center gap-x-1.5 font-bold " + size}>
      {meta && <span dir="ltr">{meta}</span>}
      {i.name_ur ? <span style={urdu}>{i.name_ur}</span> : <span dir="ltr">{i.name}</span>}
    </div>
  );
}

function Row({ v, l }: { v: string; l: string }) {
  return <div className="flex items-baseline"><span className="w-[7.5em] text-right font-bold">{v}</span><span className="ml-1 font-bold">:{l}</span></div>;
}

function InvoiceSlip({ d, printedAt }: { d: Detail; printedAt: string }) {
  const { sale: s, customer: c } = d;
  const gross = d.items.reduce((x, i) => x + i.qty * i.price, 0);
  const discount = Number(s.line_discount) + Number(s.discount);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const showBal = !!c && !c.is_walk_in;
  const odd = d.payments.length > 1 || (d.payments.length === 1 && d.payments[0].method.toLowerCase() !== "cash");
  return (
    <div className="text-[12px] leading-snug text-black">
      <p className="text-center text-[20px] font-bold leading-tight">{BUSINESS.name}</p>
      <p className="text-center text-[11px] font-bold uppercase">{BUSINESS.address} - {BUSINESS.phone}</p>
      <p className="text-right text-[11px]">Page 1 of 1</p>
      <p className="mt-1 border-b-2 border-black text-[13px] font-bold uppercase italic">{s.customer_name}{s.contact_phone ? " · " + s.contact_phone : ""}</p>
      <div className="mt-1 flex justify-between text-[13px] font-bold"><span>Inv # {s.no}</span><span>Dated {dmy(s.sale_date)}</span></div>
      {s.remarks && <p className="font-bold">Remarks {s.remarks}</p>}
      <div className="flex justify-between text-[10px]"><span>{printedAt}</span><span className="text-[12px] italic">{termLabel(s)}</span></div>
      <table className="mt-0.5 w-full border-collapse border border-black text-[12px]">
        <colgroup><col style={{ width: "22%" }} /><col style={{ width: "24%" }} /><col /><col style={{ width: "13%" }} /></colgroup>
        <thead>
          <tr className="border-b border-black text-center text-[11px]" style={urdu}>
            <th className="border-r border-black px-0.5 font-normal">ٹوٹل</th><th className="border-r border-black px-0.5 font-normal">ریٹ</th><th className="border-r border-black px-0.5 font-normal">تفصیل آئٹم</th><th className="px-0.5 font-normal">تعداد</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((i) => {
            const net = i.qty > 0 ? (i.qty * i.price - i.line_disc) / i.qty : i.price;
            return (
              <tr key={i.id} className="border-b border-black align-middle">
                <td className="border-r border-black px-1 py-0.5 text-right font-bold">{n(i.qty * i.price)}</td>
                <td className="border-r border-black px-1 py-0.5 text-center">{n(i.price)}{Number(i.line_disc) > 0 && <><br /><span className="text-[11px]">({n(Math.round(net * 100) / 100)})</span></>}</td>
                <td className="border-r border-black px-1 py-0.5"><ProductName i={i} /></td>
                <td className="px-1 py-0.5 text-right font-bold">{qtyOf(i)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1 flex items-baseline justify-between text-[13px]">
        <span className="flex items-baseline"><b className="w-[5.4em] text-right">{n(gross)}</b><b className="ml-2">Items: {d.items.length}</b></span><b>{n(pieces)}</b>
      </div>
      <div className="flex items-baseline justify-between text-[13px]">
        <Row v={discount > 0 ? "-" + n(discount) : "0"} l="Discount" /><Row v={n(s.bilti)} l="Bilti" />
      </div>
      {Number(s.local_charges) > 0 && <div className="text-[13px]"><Row v={n(s.local_charges)} l="Local" /></div>}
      <div className="mt-0.5 border-t border-black pt-0.5 text-[13px]">
        <Row v={n(s.total)} l="Net" />
        <Row v={n(s.paid)} l="Cash Received" />
        {odd && <p className="ml-[7.5em] text-[10px]">{d.payments.map((p) => p.method + " " + n(p.amount)).join(" + ")}</p>}
        {showBal && <><Row v={n(d.prev_balance)} l="Previous Bal" /><div className="border-t border-black"><Row v={n(d.final_balance)} l="Final Bal" /></div></>}
      </div>
      <p className="mt-2 text-center text-[9px]">{BUSINESS.credit}</p>
    </div>
  );
}

function Header({ title, d }: { title: string; d: Detail }) {
  return (
    <>
      <p className="text-center text-[18px] font-bold leading-tight">{BUSINESS.name}</p>
      <p className="mb-1 text-center text-[13px] font-bold tracking-wide">{title}</p>
      <div className="flex justify-between text-[13px] font-bold"><span>Inv # {d.sale.no}</span><span>{dmy(d.sale.sale_date)}</span></div>
    </>
  );
}

/** Warehouse / gate slip: no prices. Each product shows its location and rack. */
function GateSlip({ d }: { d: Detail }) {
  const { sale: s, customer: c } = d;
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  return (
    <div className="text-[12px] leading-snug text-black">
      <Header title="GATE-OUT SLIP" d={d} />
      <p className="mt-1 border-b border-black font-bold uppercase">{s.customer_name}</p>
      <p className="text-[11px]">{[c?.area?.name, c?.route?.name, s.contact_phone ?? c?.phone].filter(Boolean).join(" · ")}{(c?.area || c?.route || s.contact_phone || c?.phone) ? " · " : ""}<b>{termLabel(s)}</b></p>
      <table className="mt-1 w-full border-collapse text-[12px]">
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id} className="border-b border-dotted border-black align-top">
              <td className="w-[3.2em] py-1 pr-1 text-[15px] font-bold">{qtyOf(i)}</td>
              <td className="py-1">
                <ProductName i={i} size="text-[13px]" />
                <div className="mt-0.5 space-y-px text-[11px]">
                  {i.allocs.map((a, k) => <p key={k}>{a.location}{a.racks.length ? " · Rack " + a.racks.join(", ") : " · no rack"} × {n(a.qty)}</p>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-right font-bold">{d.items.length} items · {n(pieces)} pieces</p>
      {s.remarks && <p>Remarks: {s.remarks}</p>}
      <p className="mt-4 flex justify-between text-[11px]"><span>Packed by: ______</span><span>Gate: ______</span></p>
      <p className="mt-2 text-center text-[9px]">{BUSINESS.credit}</p>
    </div>
  );
}

/** For the delivery man: customer details, the goods, and a box for the customer to confirm receipt. */
function DeliverySlip({ d }: { d: Detail }) {
  const { sale: s, customer: c } = d;
  const due = Number(s.total) - Number(s.paid);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const cash = saleKind(s).key === "cash" && due > 0;
  return (
    <div className="text-[12px] leading-snug text-black">
      <Header title="DELIVERY SLIP" d={d} />
      <div className="mt-1 rounded border border-black p-1.5">
        <p className="text-[14px] font-bold uppercase">{s.customer_name}</p>
        {c?.name_ur && !c.is_walk_in && <p className="text-[13px]" style={urdu}>{c.name_ur}</p>}
        {(s.contact_phone ?? c?.phone) && <p>Phone: <b>{s.contact_phone ?? c?.phone}</b></p>}
        {c?.address && <p>{c.address}</p>}
        {(c?.area || c?.route) && <p className="text-[11px]">{[c?.area?.name, c?.route?.name].filter(Boolean).join(" · ")}</p>}
      </div>
      <table className="mt-1 w-full border-collapse border border-black text-[12px]">
        <thead><tr className="border-b border-black text-left text-[11px]"><th className="w-[3.2em] border-r border-black px-1">Qty</th><th className="px-1">Item</th></tr></thead>
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id} className="border-b border-black">
              <td className="border-r border-black px-1 py-0.5 text-[14px] font-bold">{qtyOf(i)}</td>
              <td className="px-1 py-0.5"><ProductName i={i} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-0.5 text-right text-[11px]">{d.items.length} items · {n(pieces)} pieces</p>
      <p className="mt-1 text-center text-[14px] font-bold">{cash ? "COLLECT Rs " + n(due) + " (Cash)" : due > 0 ? "On credit. Balance Rs " + n(due) : "Paid. Nothing to collect"}</p>
      {s.remarks && <p>Remarks: {s.remarks}</p>}
      <div className="mt-2 rounded border border-black p-1.5 text-[11px]">
        <p className="text-right text-[12px]" style={urdu}>مال مکمل اور درست حالت میں وصول کیا</p>
        <p className="text-center text-[10px]">Goods received complete and in good condition</p>
        <p className="mt-3">Received by: ____________________</p>
        <p className="mt-3 flex justify-between"><span>Signature / stamp: ____________</span><span>Date: ________</span></p>
      </div>
      <p className="mt-1 text-center text-[9px]">{BUSINESS.credit}</p>
    </div>
  );
}

/** Prints invoices (80mm roll or A4), gate-out slips or delivery slips for one or many invoices. A4 puts several slips on a page with dashed dividers. */
export default function SalePrint({ ids, type, layout: first }: { ids: string[]; type: PrintType; layout: "a4" | "roll" }) {
  const [docs, setDocs] = useState<Detail[] | null>(null);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState(first);
  const printedAt = useMemo(stamp, []);

  useEffect(() => {
    (async () => {
      try {
        const all = await Promise.all(ids.map(async (id) => {
          const r = await fetch("/api/sales/" + id);
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not load an invoice");
          return j as Detail;
        }));
        setDocs(all);
        await document.fonts?.ready;
        setTimeout(() => window.print(), 400);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [ids]);

  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!docs) return <p className="p-4 text-muted">Preparing…</p>;
  const roll = layout === "roll";
  const Slip = ({ d }: { d: Detail }) => (type === "invoice" ? <InvoiceSlip d={d} printedAt={printedAt} /> : type === "gateout" ? <GateSlip d={d} /> : <DeliverySlip d={d} />);

  return (
    <div className="min-h-dvh bg-white text-black">
      <style>{`@page { size: ${roll ? "80mm auto" : "A4"}; margin: ${roll ? "2mm" : "8mm"}; } @media print { html, body { background: #fff !important; } }`}</style>
      <div data-noprint className="flex flex-wrap items-center gap-2 border-b border-gray-300 bg-white p-3">
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
        <button className="btn" onClick={() => setLayout(roll ? "a4" : "roll")}>{roll ? "Switch to A4 page" : "Switch to 80mm roll"}</button>
        <button className="btn" onClick={() => window.close()}>Close</button>
        <span className="text-sm text-gray-600">{docs.length} slip{docs.length === 1 ? "" : "s"} · {roll ? "80mm roll" : "A4, several per page"}</span>
      </div>
      {roll ? (
        <div className="mx-auto w-[72mm]">
          {docs.map((d, k) => <section key={d.sale.id} className="py-1" style={{ breakAfter: k < docs.length - 1 ? "page" : "auto" }}><Slip d={d} /></section>)}
        </div>
      ) : (
        <div className="mx-auto grid max-w-[194mm] grid-cols-2 print:max-w-none">
          {docs.map((d) => <section key={d.sale.id} className="break-inside-avoid border-b border-dashed border-black p-3 odd:border-r" style={{ breakInside: "avoid" }}><Slip d={d} /></section>)}
        </div>
      )}
    </div>
  );
}
