"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import CollectModal from "./CollectModal";
import { useMe } from "./Me";
import { withArea } from "@/lib/cust";
import { FULFIL, saleKind, statusPill } from "@/lib/sale-types";
import PayInvoiceModal from "./PayInvoiceModal";
import ScheduleModal from "./ScheduleModal";
import PrintModal, { type PrintJob } from "./PrintModal";
import Toast from "./Toast";
import { PageLoading, Spinner } from "./Loading";

type Item = {
  id: string; name: string; market?: boolean; code_name: string | null; name_ur: string | null; unit: string; qty: number; free: number; price: number; disc_pct: number; line_disc: number;
  allocs: { qty: number; location: string; racks: string[] }[];
};
type Detail = {
  sale: { edit_count?: number; fulfil_status: string; sale_kind: string; pay_term: string; local_charges: number; contact_phone: string | null; id: string; no: string; sale_date: string; created_at: string; customer_id: string; customer_name: string; discount: number; line_discount: number; bilti: number; total: number; paid: number; status: string; remarks: string | null };
  customer: { id: string; code: string; name: string; phone: string | null; address: string | null; is_walk_in: boolean; area: { name: string } | null; route: { name: string } | null } | null;
  items: Item[]; payments: { method: string; amount: number }[]; prev_balance: number; final_balance: number;
};

export default function InvoiceView({ id, autoPrint = false }: { id: string; autoPrint?: boolean }) {
  const { can } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [payInv, setPayInv] = useState(false);
  const [sched, setSched] = useState(false);
  const [tasks, setTasks] = useState<{ id: string; action: string; due_date: string; done_at: string | null }[]>([]);
  const loadTasks = useCallback(() => { fetch("/api/sales/" + id + "/tasks").then((r) => r.json()).then((j) => setTasks(j.items ?? [])).catch(() => {}); }, [id]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  const [job, setJob] = useState<PrintJob | null>(null);
  const printed = useRef(false);
  useEffect(() => { if (autoPrint && d && !printed.current) { printed.current = true; setJob({ ids: [id], type: "invoice", layout: "roll" }); } }, [autoPrint, d, id]);
  const [changing, setChanging] = useState(false);
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

  async function changeStatus(next: string) {
    setChanging(true);
    const r = await fetch("/api/sales/" + id + "/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    const j = await r.json().catch(() => ({}));
    setChanging(false);
    if (!r.ok) return setToast(j.error || "Could not change the status");
    setToast("Status changed"); load();
  }

  if (error) return <p className="p-4 text-red">{error} <Link href="/sales" className="underline">Back</Link></p>;
  if (!d) return <PageLoading />;
  const { sale: s, customer: c } = d;
  const st = statusPill(s), kd = saleKind(s);
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
        <span className={"pill " + kd.pill}>{kd.label}</span>
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

        {s.status === "confirmed" && can("sales.status") && (
          <section data-noprint className="card flex items-center gap-3 p-3">
            <label className="text-sm font-semibold" htmlFor="inv-status">Status</label>
            <select id="inv-status" className="input max-w-48" value={s.fulfil_status} disabled={changing} onChange={(e) => changeStatus(e.target.value)}>
              {FULFIL.map(([k, label]) => <option key={k} value={k}>{k === "active" && s.sale_kind === "counter" && due > 0 ? "Active (Hold)" : label}</option>)}
            </select>
            {changing && <Spinner />}
          </section>
        )}

        {(tasks.some((t) => !t.done_at) || (s.edit_count ?? 0) > 0) && (
          <section data-noprint className="card space-y-1 p-3 text-sm">
            {tasks.filter((t) => !t.done_at).map((t) => <p key={t.id}><span className="pill mr-2 border border-accent text-accent">Scheduled</span>{({ pack: "Packing", deliver: "Delivery", complete: "Completion" } as Record<string, string>)[t.action]} on <b>{niceDate(t.due_date)}</b></p>)}
            {(s.edit_count ?? 0) > 0 && <p className="text-muted">This order was edited {s.edit_count} time{s.edit_count === 1 ? "" : "s"}.</p>}
          </section>
        )}

        <section className="card p-4">
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{i.name} {i.market && <span className="pill bg-bg text-muted">Market</span>}</p>
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
            {Number(s.local_charges) > 0 && <div className="flex justify-between"><dt className="text-muted">Local charges</dt><dd>+ {rs(s.local_charges)}</dd></div>}
            {Number(s.bilti) > 0 && <div className="flex justify-between"><dt className="text-muted">Bilti</dt><dd>+ {rs(s.bilti)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold"><dt>Total</dt><dd>{rs(s.total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{rs(s.paid)}</dd></div>
            {d.payments.length > 0 && <p className="text-right text-xs text-muted">{d.payments.map((p) => p.method + " " + rs(p.amount)).join(" · ")}</p>}
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
          <button className="btn" onClick={() => setJob({ ids: [id], type: "invoice", layout: "roll" })}>Print invoice (80mm)</button>
          {s.status === "confirmed" && <button className="btn" onClick={() => setJob({ ids: [id], type: "gateout", layout: "roll" })}>Gate-out slip (80mm)</button>}
          {s.status === "confirmed" && <button className="btn" onClick={() => setJob({ ids: [id], type: "delivery", layout: "a4" })}>Delivery slip (A4)</button>}
          {s.status === "confirmed" && ["active", "packed"].includes(s.fulfil_status) && can("sales.edit") && <Link className="btn btn-primary" href={"/sales/" + id + "/edit"}>Edit order</Link>}
          {s.status === "confirmed" && s.fulfil_status !== "completed" && can("sales.status") && <button className="btn" onClick={() => setSched(true)}>Schedule</button>}
          {s.status === "confirmed" && ["delivered", "completed"].includes(s.fulfil_status) && can("sales.return") && <><Link className="btn" href={"/returns?sale=" + id}>Return</Link><Link className="btn" href={"/returns?sale=" + id + "&kind=claim"}>Claim</Link></>}
          <button className="btn" onClick={share}>Share</button>
          {(can("payments.receive") || can("sales.create")) && due > 0 && <button className="btn btn-primary" onClick={() => setPayInv(true)}>Receive payment ({rs(due)})</button>}
          {can("payments.receive") && !c?.is_walk_in && s.status === "confirmed" && d.final_balance > 0 && <button className="btn" onClick={() => setCollect(true)}>Collect from customer</button>}
          {can("sales.cancel") && s.status === "confirmed" && <button className="btn text-red" disabled={busy} onClick={cancel}>Cancel invoice</button>}
          {c && <Link href={"/customers/" + c.id} className="btn">Customer</Link>}
        </div>
      </div>

      {sched && <ScheduleModal saleId={id} no={s.no} onClose={() => { setSched(false); loadTasks(); }} onChanged={(m) => { setToast(m); load(); loadTasks(); }} />}
      {job && <PrintModal job={job} onClose={() => setJob(null)} />}
      {payInv && <PayInvoiceModal saleId={id} no={s.no} due={due} onClose={() => setPayInv(false)} onDone={(m) => { setPayInv(false); setToast(m); load(); }} />}
      {collect && c && <CollectModal customer={{ id: c.id, name: withArea(c.name, c.area?.name) }} onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
