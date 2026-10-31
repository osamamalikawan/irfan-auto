"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import CollectModal from "./CollectModal";
import { useMe } from "./Me";
import { saleState } from "./SalesList";
import Toast from "./Toast";
import { PageLoading } from "./Loading";

type Item = {
  id: string; name: string; code_name: string | null; name_ur: string | null; unit: string; qty: number; free: number; price: number; disc_pct: number; line_disc: number;
  allocs: { qty: number; location: string; racks: string[] }[];
};
type Detail = {
  sale: { id: string; no: string; sale_date: string; created_at: string; customer_id: string; customer_name: string; discount: number; line_discount: number; bilti: number; total: number; paid: number; status: string; remarks: string | null };
  customer: { id: string; code: string; name: string; phone: string | null; address: string | null; is_walk_in: boolean; area: { name: string } | null; route: { name: string } | null } | null;
  items: Item[]; prev_balance: number; final_balance: number;
};

export default function InvoiceView({ id }: { id: string }) {
  const { can } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/sales/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the invoice");
    setD(j);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    if (!window.confirm("Cancel this invoice? The stock goes back and the customer's account is corrected.")) return;
    setBusy(true);
    const r = await fetch("/api/sales/" + id + "/cancel", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setToast(j.error || "Could not cancel");
    setToast("Invoice cancelled"); load();
  }

  if (error) return <p className="p-4 text-red">{error} <Link href="/sales" className="underline">Back</Link></p>;
  if (!d) return <PageLoading />;
  const { sale: s, customer: c } = d;
  const st = saleState(s);
  const due = s.status === "confirmed" ? Number(s.total) - Number(s.paid) : 0;
  const pieces = d.items.reduce((x, i) => x + Number(i.qty), 0), free = d.items.reduce((x, i) => x + Number(i.free), 0);

  function shareText() {
    const lines = d!.items.map((i) => "• " + i.name + " × " + fmtQty(i.qty) + (Number(i.free) ? " (+" + fmtQty(i.free) + " free)" : "") + " = " + rs(i.qty * i.price - i.line_disc));
    return ["Irfan Autos", s.no + " · " + niceDate(s.sale_date), s.customer_name, "", ...lines, "", "Total: " + rs(s.total), "Paid: " + rs(s.paid), due > 0 ? "Due: " + rs(due) : "Paid in full"].join("\n");
  }
  async function share() {
    const text = shareText();
    if (navigator.share) { try { await navigator.share({ title: s.no, text }); return; } catch { /* cancelled */ } }
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }

  return (
    <div>
      <header data-noprint className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/sales" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{s.no}</h1>
        <span className={"pill " + st.cls}>{st.label}</span>
      </header>

      <div className="space-y-3 p-3 lg:max-w-3xl lg:px-5">
        <section className="card p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-snug">{s.customer_name}</p>
              <p className="text-sm text-muted">{[c?.code, c?.area?.name, c?.route?.name].filter(Boolean).join(" · ")}</p>
              {c?.phone && <p className="text-sm text-muted">{c.phone}</p>}
            </div>
            <div className="text-right text-sm"><p className="font-semibold">{s.no}</p><p className="text-muted">{niceDate(s.sale_date)}</p></div>
          </div>
        </section>

        <section className="card p-4">
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{i.name}</p>
                    {i.name_ur && <p className="ur text-sm text-muted">{i.name_ur}</p>}
                    <p className="text-xs text-muted">{fmtQty(i.qty)} × {rs(i.price)}{Number(i.disc_pct) > 0 ? " − " + i.disc_pct + "%" : ""}{Number(i.free) > 0 ? " · +" + fmtQty(i.free) + " free" : ""}</p>
                    {s.status === "confirmed" && (
                      <p className="text-xs text-accent">Pick from: {i.allocs.map((a) => a.location + (a.racks.length ? " (rack " + a.racks.join(", ") + ")" : "") + " × " + fmtQty(a.qty)).join(" · ")}</p>
                    )}
                  </div>
                  <p className="font-semibold">{rs(i.qty * i.price - i.line_disc)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{d.items.length} item{d.items.length === 1 ? "" : "s"} · {fmtQty(pieces)} pieces{free ? " + " + fmtQty(free) + " free" : ""}</p>
        </section>

        <section className="card p-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(d.items.reduce((x, i) => x + i.qty * i.price, 0))}</dd></div>
            {Number(s.line_discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Item discounts</dt><dd>− {rs(s.line_discount)}</dd></div>}
            {Number(s.discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Invoice discount</dt><dd>− {rs(s.discount)}</dd></div>}
            {Number(s.bilti) > 0 && <div className="flex justify-between"><dt className="text-muted">Bilti</dt><dd>+ {rs(s.bilti)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold"><dt>Total</dt><dd>{rs(s.total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{rs(s.paid)}</dd></div>
            {due > 0 && <div className="flex justify-between font-semibold text-red"><dt>Due on this invoice</dt><dd>{rs(due)}</dd></div>}
            {!c?.is_walk_in && s.status === "confirmed" && (
              <>
                <div className="flex justify-between border-t border-line pt-1"><dt className="text-muted">Previous balance</dt><dd>{rs(d.prev_balance)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Balance now</dt><dd>{rs(d.final_balance)}</dd></div>
              </>
            )}
          </dl>
          {s.remarks && <p className="mt-2 text-sm text-muted">Remarks: {s.remarks}</p>}
        </section>

        <div data-noprint className="grid grid-cols-2 gap-2 lg:flex">
          <button className="btn" onClick={() => window.print()}>Print</button>
          <button className="btn" onClick={share}>Share</button>
          {can("payments.receive") && !c?.is_walk_in && s.status === "confirmed" && d.final_balance > 0 && <button className="btn btn-primary" onClick={() => setCollect(true)}>Collect payment</button>}
          {can("sales.cancel") && s.status === "confirmed" && <button className="btn text-red" disabled={busy} onClick={cancel}>Cancel invoice</button>}
          {c && <Link href={"/customers/" + c.id} className="btn">Customer</Link>}
        </div>
      </div>

      {collect && c && <CollectModal customer={{ id: c.id, name: c.name }} onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
