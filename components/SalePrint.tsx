"use client";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS } from "@/lib/business";
import { withArea } from "@/lib/cust";
import { saleKind } from "@/lib/sale-types";

type Item = {
  id: string; name: string; name_ur: string | null; code_name: string | null; brand: string | null; qty: number; free: number; price: number; disc_pct: number; line_disc: number;
  allocs: { qty: number; location: string; racks: string[] }[];
};
export type Detail = {
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

/** "Hashir Auto - Qasim Bela": the customer with their area. Walk-in customers have no area. */
const custName = (d: Detail) => withArea(d.sale.customer_name, d.customer && !d.customer.is_walk_in ? d.customer.area?.name : null);
const Logo = ({ src, className }: { src: string | null; className: string }) => (src ? <img src={src} alt="" className={className} /> : null);
const phoneOf = (d: Detail) => d.sale.contact_phone ?? d.customer?.phone ?? null;

/** Product name on every slip: the Urdu name only. The English name is used only when a product has no Urdu name yet. */
function Name({ i, className = "" }: { i: Item; className?: string }) {
  return i.name_ur ? <span className={className} style={urdu}>{i.name_ur}</span> : <span className={className} dir="ltr">{i.name}</span>;
}

/* ------------------------------------------------------------------ 80mm roll ------------------------------------------------------------------ */

function Row({ v, l }: { v: string; l: string }) {
  return <div className="flex items-baseline"><span className="w-[7.5em] text-right font-bold">{v}</span><span className="ml-1 font-bold">:{l}</span></div>;
}

function InvoiceRoll({ d, printedAt, logo }: { d: Detail; printedAt: string; logo: string | null }) {
  const { sale: s, customer: c } = d;
  const gross = d.items.reduce((x, i) => x + i.qty * i.price, 0);
  const discount = Number(s.line_discount) + Number(s.discount);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const showBal = !!c && !c.is_walk_in;
  const odd = d.payments.length > 1 || (d.payments.length === 1 && d.payments[0].method.toLowerCase() !== "cash");
  return (
    <div className="text-[12px] leading-snug text-black">
      <Logo src={logo} className="mx-auto mb-1 max-h-[20mm] max-w-full object-contain" />
      <p className="text-center text-[20px] font-bold leading-tight">{BUSINESS.name}</p>
      <p className="text-center text-[11px] font-bold uppercase">{BUSINESS.address} - {BUSINESS.phone}</p>
      <p className="text-right text-[11px]">Page 1 of 1</p>
      <p className="mt-1 border-b-2 border-black text-[13px] font-bold uppercase italic">{custName(d)}{s.contact_phone ? " · " + s.contact_phone : ""}</p>
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
                <td className="border-r border-black px-1 py-0.5 text-center text-[13px] font-bold"><Name i={i} /></td>
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

function RollHead({ title, d }: { title: string; d: Detail }) {
  return (
    <>
      <p className="text-center text-[18px] font-bold leading-tight">{BUSINESS.name}</p>
      <p className="mb-1 text-center text-[13px] font-bold tracking-wide">{title}</p>
      <div className="flex justify-between text-[13px] font-bold"><span>Inv # {d.sale.no}</span><span>{dmy(d.sale.sale_date)}</span></div>
    </>
  );
}

/** 80mm gate slip: no prices. Each product shows its location and rack. */
function GateRoll({ d }: { d: Detail }) {
  const { sale: s, customer: c } = d;
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const sub = [c?.route?.name, phoneOf(d)].filter(Boolean).join(" · ");
  return (
    <div className="text-[12px] leading-snug text-black">
      <RollHead title="GATE-OUT SLIP" d={d} />
      <p className="mt-1 border-b border-black font-bold uppercase">{custName(d)}</p>
      <p className="text-[11px]">{sub}{sub ? " · " : ""}<b>{termLabel(s)}</b></p>
      <table className="mt-1 w-full border-collapse text-[12px]">
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id} className="border-b border-dotted border-black align-top">
              <td className="w-[3.2em] py-1 pr-1 text-[15px] font-bold">{qtyOf(i)}</td>
              <td className="py-1">
                <div className="text-center text-[13px] font-bold"><Name i={i} /></div>
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
    </div>
  );
}

/** 80mm delivery slip: customer details, the goods, and a box for the customer to confirm receipt. */
function DeliveryRoll({ d }: { d: Detail }) {
  const { sale: s, customer: c } = d;
  const due = Number(s.total) - Number(s.paid);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const cash = saleKind(s).key === "cash" && due > 0;
  return (
    <div className="text-[12px] leading-snug text-black">
      <RollHead title="DELIVERY SLIP" d={d} />
      <div className="mt-1 rounded border border-black p-1.5">
        <p className="text-[14px] font-bold uppercase">{custName(d)}</p>
        {phoneOf(d) && <p>Phone: <b>{phoneOf(d)}</b></p>}
        {c?.address && <p>{c.address}</p>}
        {c?.route && <p className="text-[11px]">{c.route.name}</p>}
      </div>
      <table className="mt-1 w-full border-collapse border border-black text-[12px]">
        <thead><tr className="border-b border-black text-left text-[11px]"><th className="w-[3.2em] border-r border-black px-1">Qty</th><th className="px-1 text-center">Item</th></tr></thead>
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id} className="border-b border-black">
              <td className="border-r border-black px-1 py-0.5 text-[14px] font-bold">{qtyOf(i)}</td>
              <td className="px-1 py-0.5 text-center text-[13px] font-bold"><Name i={i} /></td>
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
    </div>
  );
}

/* --------------------------------------------------------------------- A4 ---------------------------------------------------------------------- */

const th = "border border-black bg-gray-100 px-2 py-1 font-semibold";
const td = "border border-black px-2 py-1";

function A4Head({ title, d, right, logo }: { title: string; d: Detail; right?: React.ReactNode; logo?: string | null }) {
  const s = d.sale;
  return (
    <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
      <div>
        <Logo src={logo ?? null} className="mb-1 max-h-[18mm] max-w-[60mm] object-contain" />
        <p className="text-[24px] font-bold leading-tight">{BUSINESS.name}</p>
        <p className="text-[11px] font-semibold uppercase">{BUSINESS.address}</p>
        <p className="text-[11px]">Phone: {BUSINESS.phone}</p>
      </div>
      <div className="text-right">
        <p className="text-[18px] font-bold tracking-wide">{title}</p>
        <p className="text-[13px]">No. <b>{s.no}</b></p>
        <p>Date: <b>{dmy(s.sale_date)}</b></p>
        <p className="italic">{termLabel(s)}</p>
        {right}
      </div>
    </div>
  );
}

function InvoiceA4({ d, printedAt, logo }: { d: Detail; printedAt: string; logo: string | null }) {
  const { sale: s, customer: c } = d;
  const gross = d.items.reduce((x, i) => x + i.qty * i.price, 0);
  const discount = Number(s.line_discount) + Number(s.discount);
  const showBal = !!c && !c.is_walk_in;
  const line = (l: string, v: string, bold = false) => <div className={"flex justify-between gap-6 py-0.5 " + (bold ? "border-t border-black text-[14px] font-bold" : "")}><span>{l}</span><span>{v}</span></div>;
  return (
    <div className="text-[12px] text-black">
      <A4Head title="SALES INVOICE" d={d} logo={logo} />
      <div className="mt-2 flex justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase text-gray-600">Customer</p>
          <p className="text-[16px] font-bold">{custName(d)}</p>
          {phoneOf(d) && <p>Phone: {phoneOf(d)}</p>}
          {c?.address && !c.is_walk_in && <p>{c.address}</p>}
        </div>
        {s.remarks && <p className="max-w-[60mm] text-right"><span className="text-[10px] uppercase text-gray-600">Remarks</span><br />{s.remarks}</p>}
      </div>
      <table className="mt-2 w-full border-collapse text-[12px]">
        <thead><tr><th className={th + " w-8 text-center"}>#</th><th className={th + " text-right"}>Item</th><th className={th + " w-16 text-right"}>Qty</th><th className={th + " w-20 text-right"}>Rate</th><th className={th + " w-20 text-right"}>Discount</th><th className={th + " w-24 text-right"}>Amount</th></tr></thead>
        <tbody>
          {d.items.map((i, k) => (
            <tr key={i.id}>
              <td className={td + " text-center"}>{k + 1}</td>
              <td className={td + " text-right text-[14px] font-semibold"}><Name i={i} /></td>
              <td className={td + " text-right"}>{qtyOf(i)}</td>
              <td className={td + " text-right"}>{n(i.price)}</td>
              <td className={td + " text-right"}>{Number(i.line_disc) > 0 ? n(i.line_disc) : ""}</td>
              <td className={td + " text-right font-semibold"}>{n(i.qty * i.price - i.line_disc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-start justify-between gap-6">
        <p className="text-[10px] text-gray-600">Printed {printedAt}</p>
        <div className="w-[72mm] text-[12px]">
          {line("Items total", n(gross))}
          {discount > 0 && line("Discount", "-" + n(discount))}
          {Number(s.local_charges) > 0 && line("Local charges", n(s.local_charges))}
          {Number(s.bilti) > 0 && line("Bilti", n(s.bilti))}
          {line("Net", n(s.total), true)}
          {line("Received", n(s.paid))}
          {d.payments.length > 0 && <p className="text-right text-[10px] text-gray-600">{d.payments.map((p) => p.method + " " + n(p.amount)).join(" + ")}</p>}
          {showBal && line("Previous balance", n(d.prev_balance))}
          {showBal && line("Final balance", n(d.final_balance), true)}
        </div>
      </div>
    </div>
  );
}

function GateA4({ d }: { d: Detail }) {
  const s = d.sale;
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  return (
    <div className="text-[12px] text-black">
      <A4Head title="GATE-OUT SLIP" d={d} />
      <div className="mt-2">
        <p className="text-[10px] uppercase text-gray-600">Customer</p>
        <p className="text-[16px] font-bold">{custName(d)}</p>
        {phoneOf(d) && <p>Phone: {phoneOf(d)}</p>}
      </div>
      <table className="mt-2 w-full border-collapse">
        <thead><tr><th className={th + " w-8 text-center"}>#</th><th className={th + " w-16 text-right"}>Qty</th><th className={th + " text-right"}>Item</th><th className={th + " text-left"}>Location and rack</th></tr></thead>
        <tbody>
          {d.items.map((i, k) => (
            <tr key={i.id} className="align-top">
              <td className={td + " text-center"}>{k + 1}</td>
              <td className={td + " text-right text-[15px] font-bold"}>{qtyOf(i)}</td>
              <td className={td + " text-right text-[14px] font-semibold"}><Name i={i} /></td>
              <td className={td}>{i.allocs.map((a, j) => <p key={j}><b>{a.location}</b>{a.racks.length ? " · Rack " + a.racks.join(", ") : " · no rack"} × {n(a.qty)}</p>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-right font-semibold">{d.items.length} items · {n(pieces)} pieces</p>
      {s.remarks && <p>Remarks: {s.remarks}</p>}
      <div className="mt-6 grid grid-cols-3 gap-6 text-[11px]"><p className="border-t border-black pt-1">Packed by</p><p className="border-t border-black pt-1">Checked by</p><p className="border-t border-black pt-1">Gate keeper</p></div>
    </div>
  );
}

function DeliveryA4({ d }: { d: Detail }) {
  const { sale: s, customer: c } = d;
  const due = Number(s.total) - Number(s.paid);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0);
  const cash = saleKind(s).key === "cash" && due > 0;
  return (
    <div className="text-[12px] text-black">
      <A4Head title="DELIVERY SLIP" d={d} />
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-4">
        <div className="rounded border border-black p-2">
          <p className="text-[10px] uppercase text-gray-600">Deliver to</p>
          <p className="text-[16px] font-bold">{custName(d)}</p>
          {phoneOf(d) && <p>Phone: <b>{phoneOf(d)}</b></p>}
          {c?.address && <p>{c.address}</p>}
          {c?.route && <p className="text-[11px] text-gray-700">Route: {c.route.name}</p>}
        </div>
        <div className="flex min-w-[52mm] flex-col items-center justify-center rounded border-2 border-black px-3 text-center">
          {cash ? <><p className="text-[10px] uppercase">Collect cash</p><p className="text-[22px] font-bold">Rs {n(due)}</p></> : <p className="text-[13px] font-bold">{due > 0 ? "On credit" : "Paid"}<br /><span className="text-[11px] font-normal">{due > 0 ? "Nothing to collect" : "Nothing to collect"}</span></p>}
        </div>
      </div>
      <table className="mt-2 w-full border-collapse">
        <thead><tr><th className={th + " w-8 text-center"}>#</th><th className={th + " text-right"}>Item</th><th className={th + " w-20 text-right"}>Qty</th></tr></thead>
        <tbody>
          {d.items.map((i, k) => (
            <tr key={i.id}><td className={td + " text-center"}>{k + 1}</td><td className={td + " text-right text-[14px] font-semibold"}><Name i={i} /></td><td className={td + " text-right text-[15px] font-bold"}>{qtyOf(i)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-right font-semibold">{d.items.length} items · {n(pieces)} pieces</p>
      {s.remarks && <p>Remarks: {s.remarks}</p>}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-4 rounded border border-black p-2 text-[11px]">
        <div>
          <p className="text-[13px]" style={urdu}>مال مکمل اور درست حالت میں وصول کیا</p>
          <p className="text-[10px]">Goods received complete and in good condition</p>
          <p className="mt-5">Received by: ______________________________</p>
        </div>
        <div className="flex flex-col justify-end gap-5"><p>Signature / stamp: ________________</p><p>Date and time: ________________</p></div>
      </div>
      <p className="mt-6 border-t border-black pt-1 text-[11px]">Delivery man: ______________________</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the page ------------------------------------------------------------------- */

/**
 * Invoices, gate-out slips or delivery slips for one or many invoices.
 * roll = 80mm thermal. a4 = its own wider layout, slips stacked on the page with a dashed line between them.
 * embed = shown inside the print popup: the popup has the buttons and starts the print dialog.
 */
export default function SalePrint({ ids, type, layout: first, embed = false }: { ids: string[]; type: PrintType; layout: "a4" | "roll"; embed?: boolean }) {
  const [docs, setDocs] = useState<Detail[] | null>(null);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState(first);
  const [logo, setLogo] = useState<string | null>(null);
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
        let lg: string | null = null;
        if (type === "invoice") {
          lg = await fetch("/api/settings/logo").then((r) => r.json()).then((j) => (typeof j.logo === "string" ? j.logo : null)).catch(() => null);
          if (lg) await new Promise<void>((done) => { const stop = setTimeout(done, 2500); const fin = () => { clearTimeout(stop); done(); }; const im = new Image(); im.onload = fin; im.onerror = fin; im.src = lg!; });
        }
        setLogo(lg);
        setDocs(all);
        await document.fonts?.ready;
        if (embed) setTimeout(() => window.parent.postMessage({ type: "sale-print-ready" }, location.origin), 300);
        else setTimeout(() => window.print(), 400);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [ids, embed, type]);

  if (error) return <p className="p-4 text-red">{error}</p>;
  if (!docs) return <p className="p-4 text-muted">Preparing…</p>;
  const roll = layout === "roll";
  const slip = (d: Detail) => {
    if (roll) return type === "invoice" ? <InvoiceRoll d={d} printedAt={printedAt} logo={logo} /> : type === "gateout" ? <GateRoll d={d} /> : <DeliveryRoll d={d} />;
    return type === "invoice" ? <InvoiceA4 d={d} printedAt={printedAt} logo={logo} /> : type === "gateout" ? <GateA4 d={d} /> : <DeliveryA4 d={d} />;
  };

  return (
    <div className="min-h-dvh bg-white text-black">
      <style>{`@page { size: ${roll ? "78mm auto" : "A4"}; margin: ${roll ? "0" : "10mm"}; } @media print { html, body { background: #fff !important; margin: 0 !important; ${roll ? "width: 78mm !important;" : ""} } }`}</style>
      {!embed && (
        <div data-noprint className="flex flex-wrap items-center gap-2 border-b border-gray-300 bg-white p-3">
          <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
          <button className="btn" onClick={() => setLayout(roll ? "a4" : "roll")}>{roll ? "Switch to A4 page" : "Switch to 80mm roll"}</button>
          <button className="btn" onClick={() => window.close()}>Close</button>
        </div>
      )}
      {roll ? (
        <div className="mx-auto w-[72mm] max-w-full">
          {docs.map((d, k) => <section key={d.sale.id} className="py-1" style={{ breakAfter: k < docs.length - 1 ? "page" : "auto" }}>{slip(d)}</section>)}
        </div>
      ) : (
        <div className="mx-auto max-w-[190mm] print:max-w-none">
          {docs.map((d) => <section key={d.sale.id} className="border-b border-dashed border-black py-4 last:border-0" style={{ breakInside: "avoid" }}>{slip(d)}</section>)}
        </div>
      )}
    </div>
  );
}
