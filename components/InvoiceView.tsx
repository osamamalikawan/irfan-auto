"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { withArea } from "@/lib/cust";
import { niceDate } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { FULFIL, canMoveStatus, fulfilIndex, saleKind, statusPill } from "@/lib/sale-types";
import CollectModal from "./CollectModal";
import { PageLoading, Spinner } from "./Loading";
import { useMe } from "./Me";
import PayInvoiceModal from "./PayInvoiceModal";
import PrintModal, { type PrintJob } from "./PrintModal";
import ScheduleModal from "./ScheduleModal";
import Toast from "./Toast";

type Item = {
  id: string; name: string; market?: boolean; code_name: string | null; name_ur: string | null; unit: string; qty: number; free: number; price: number; disc_pct: number; line_disc: number;
  allocs: { qty: number; location: string; racks: string[] }[];
};
type Detail = {
  sale: {
    edit_count?: number; fulfil_status: string; sale_kind: string; pay_term: string; local_charges: number; contact_phone: string | null; id: string; no: string; sale_date: string; created_at: string;
    customer_id: string; customer_name: string; discount: number; line_discount: number; bilti: number; total: number; paid: number; status: string; remarks: string | null; status_changed_at?: string | null;
  };
  customer: { id: string; code: string; name: string; phone: string | null; address: string | null; is_walk_in: boolean; area: { name: string } | null; route: { name: string } | null } | null;
  items: Item[]; payments: { method: string; amount: number }[]; prev_balance: number; final_balance: number;
};
type Task = { id: string; action: string; due_date: string; done_at: string | null };
const TASK_LABEL: Record<string, string> = { pack: "Packing", deliver: "Delivery", complete: "Completion" };
const STEP_NOTE: Record<string, string> = { active: "Order taken", packed: "Goods packed", delivered: "Handed over", completed: "Closed" };

/** A small drop-down of actions. It is fixed-position so no scroll area can clip it. */
function Menu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", key); };
  }, [at]);
  if (!items.length) return null;
  return (
    <>
      <button className="btn" aria-haspopup="menu" aria-expanded={!!at} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAt(at ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }); }}>{label} ▾</button>
      {at && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAt(null)} />
          <div role="menu" className="fixed z-50 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg" style={{ top: at.top, right: at.right }}>
            {items.map((i) => <button key={i.label} role="menuitem" className={"block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-bg " + (i.danger ? "text-red" : "")} onClick={() => { setAt(null); i.onClick(); }}>{i.label}</button>)}
          </div>
        </>
      )}
    </>
  );
}

/** The four steps of an order. Past steps are ticked; later steps can be tapped to move forward. Only an admin can tap an earlier step. */
function Stepper({ current, admin, allowed, busy, onGo }: { current: string; admin: boolean; allowed: boolean; busy: boolean; onGo: (k: string) => void }) {
  const cur = fulfilIndex(current);
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {FULFIL.map(([k, label], i) => {
        const done = i < cur, here = i === cur;
        const can = allowed && canMoveStatus(current, k, admin);
        return (
          <li key={k} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={"h-0.5 flex-1 " + (i === 0 ? "opacity-0" : i <= cur ? "bg-[var(--g-strong)]" : "bg-line")} />
              <button type="button" disabled={!can || busy} aria-current={here ? "step" : undefined} aria-label={label + (here ? " (current)" : done ? " (done)" : "")} title={can ? (i < cur ? "Move back to " + label + " (admin)" : "Move to " + label) : label}
                onClick={() => onGo(k)}
                className={"flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition " +
                  (done ? "bg-[var(--g-strong)] text-white" : here ? "border-2 border-[var(--g-strong)] bg-surface text-[color:var(--g-strong)] ring-4 ring-[var(--g-line)]" : "border border-line bg-surface text-muted") +
                  (can ? " cursor-pointer hover:scale-105 active:opacity-70" : " cursor-default")}>
                {busy && here ? <Spinner /> : done ? "✓" : i + 1}
              </button>
              <span className={"h-0.5 flex-1 " + (i === FULFIL.length - 1 ? "opacity-0" : i < cur ? "bg-[var(--g-strong)]" : "bg-line")} />
            </div>
            <p className={"mt-1.5 text-sm " + (here ? "font-bold text-[color:var(--g-ink)]" : done ? "font-semibold" : "text-muted")}>{label}</p>
            <p className="hidden text-[11px] text-muted sm:block">{STEP_NOTE[k]}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function InvoiceView({ id, autoPrint = false }: { id: string; autoPrint?: boolean }) {
  const { can, user } = useMe();
  const admin = isAdmin(user);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [payInv, setPayInv] = useState(false);
  const [sched, setSched] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const printed = useRef(false);

  const loadTasks = useCallback(() => { fetch("/api/sales/" + id + "/tasks").then((r) => r.json()).then((j) => setTasks(j.items ?? [])).catch(() => {}); }, [id]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  const load = useCallback(async () => {
    const r = await fetch("/api/sales/" + id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the invoice");
    setD(j);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (autoPrint && d && !printed.current) { printed.current = true; setJob({ ids: [id], type: "invoice", layout: "roll" }); } }, [autoPrint, d, id]);

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
    if (!d) return;
    if (fulfilIndex(next) < fulfilIndex(d.sale.fulfil_status) && !window.confirm("Move this order back to " + (FULFIL.find(([k]) => k === next)?.[1] ?? next) + "? Only an admin can do this.")) return;
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
  const live = s.status === "confirmed";
  const due = live ? Number(s.total) - Number(s.paid) : 0;
  const gross = d.items.reduce((x, i) => x + i.qty * i.price, 0);
  const pieces = d.items.reduce((x, i) => x + Number(i.qty), 0), free = d.items.reduce((x, i) => x + Number(i.free), 0);
  const nextStep = live ? FULFIL[fulfilIndex(s.fulfil_status) + 1] : undefined;
  const canStatus = can("sales.status") && live;
  const openTasks = tasks.filter((t) => !t.done_at);
  const name = withArea(s.customer_name, c && !c.is_walk_in ? c.area?.name : null);
  const canEdit = live && ["active", "packed"].includes(s.fulfil_status) && can("sales.edit");
  const canReturn = live && ["delivered", "completed"].includes(s.fulfil_status) && can("sales.return");

  function shareText() {
    const lines = d!.items.map((i) => "• " + i.name + " × " + fmtQty(i.qty) + (Number(i.free) ? " (+" + fmtQty(i.free) + " free)" : "") + " = " + rs(i.qty * i.price - i.line_disc));
    return ["Irfan Autos", s.no + " · " + niceDate(s.sale_date), name, "", ...lines, "", "Total: " + rs(s.total), "Paid: " + rs(s.paid), due > 0 ? "Due: " + rs(due) : "Paid in full"].join("\n");
  }
  async function share() {
    const text = shareText();
    if (navigator.share) { try { await navigator.share({ title: s.no, text }); return; } catch { /* cancelled */ } }
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }
  const print = (type: PrintJob["type"], layout: PrintJob["layout"]) => setJob({ ids: [id], type, layout });
  const printItems = [
    { label: "Invoice (80mm)", onClick: () => print("invoice", "roll") },
    { label: "Invoice (A4)", onClick: () => print("invoice", "a4") },
    ...(live ? [
      { label: "Gate-out slip (80mm)", onClick: () => print("gateout", "roll") },
      { label: "Gate-out slip (A4)", onClick: () => print("gateout", "a4") },
      { label: "Delivery slip (A4)", onClick: () => print("delivery", "a4") },
    ] : []),
  ];
  const moreItems = [
    ...(can("payments.receive") && c && !c.is_walk_in && live && d.final_balance > 0 ? [{ label: "Collect from customer", onClick: () => setCollect(true) }] : []),
    ...(c ? [{ label: "Open customer", onClick: () => { window.location.href = "/customers/" + c.id; } }] : []),
    ...(can("sales.cancel") && live ? [{ label: busy ? "Cancelling…" : "Cancel invoice", onClick: cancel, danger: true }] : []),
  ];

  return (
    <div className="inv-page min-h-[calc(100dvh-4rem)] pb-8">
      {/* ---------- top bar ---------- */}
      <header data-noprint className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-5 lg:pt-4">
        <Link href="/sales" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back to sales">←</Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoice</p>
          <h1 className="truncate text-xl font-bold leading-tight text-[color:var(--g-ink)]">{s.no}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && <Link className="btn btn-primary" href={"/sales/" + id + "/edit"}>Edit order</Link>}
          {live && s.fulfil_status !== "completed" && can("sales.status") && <button className="btn" onClick={() => setSched(true)}>Schedule</button>}
          {(can("payments.receive") || can("sales.create")) && due > 0 && <button className="btn btn-primary" onClick={() => setPayInv(true)}>Receive payment · {rs(due)}</button>}
          {canReturn && <><Link className="btn" href={"/returns?sale=" + id}>Return</Link><Link className="btn" href={"/returns?sale=" + id + "&kind=claim"}>Claim</Link></>}
          <button className="btn" onClick={share}>Share</button>
          <Menu label="Print" items={printItems} />
          <Menu label="More" items={moreItems} />
        </div>
      </header>

      <div className="grid gap-4 px-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:px-5">
        <div className="min-w-0 space-y-4">
          {/* ---------- customer and invoice ---------- */}
          <section className="inv-card p-5">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</p>
                <p className="text-2xl font-bold leading-snug">{name}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                  {(s.contact_phone ?? c?.phone) && <span>☎ {s.contact_phone ?? c?.phone}</span>}
                  {c?.address && <span>{c.address}</span>}
                  {c?.route?.name && <span>Route: {c.route.name}</span>}
                  {c && !c.is_walk_in && c.code && <span>Code {c.code}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Date</p>
                <p className="text-lg font-bold">{niceDate(s.sale_date)}</p>
                <div className="mt-1.5 flex flex-wrap justify-end gap-1.5"><span className={"pill " + kd.pill}>{kd.label}</span><span className={"pill " + st.cls}>{st.label}</span></div>
              </div>
            </div>
            {s.remarks && <p className="mt-3 rounded-lg bg-[var(--g-head)] px-3 py-2 text-sm text-[color:var(--g-ink)]"><b>Remarks:</b> {s.remarks}</p>}
          </section>

          {/* ---------- progress ---------- */}
          <section data-noprint className="inv-card p-5">
            {live ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="flex-1 font-semibold text-[color:var(--g-ink)]">Order progress</h2>
                  {nextStep && canStatus && (
                    <button className="btn btn-primary min-h-9" disabled={changing} onClick={() => changeStatus(nextStep[0])}>{changing ? <><Spinner /> Saving…</> : <>Mark as {nextStep[1]} →</>}</button>
                  )}
                </div>
                <Stepper current={s.fulfil_status} admin={admin} allowed={canStatus} busy={changing} onGo={changeStatus} />
                <p className="mt-3 text-xs text-muted">
                  {canStatus ? (admin ? "Tap a step to move the order. As an admin you can also move it back." : "The status only moves forward. Ask an admin to move it back.") : "You can view the progress of this order."}
                  {s.status_changed_at ? " Last changed " + niceDate(s.status_changed_at.slice(0, 10)) + "." : ""}
                  {(s.edit_count ?? 0) > 0 ? " Edited " + s.edit_count + " time" + (s.edit_count === 1 ? "" : "s") + "." : ""}
                </p>
                {openTasks.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {openTasks.map((t) => <li key={t.id}><span className="pill border border-[var(--g-strong)] bg-surface text-[color:var(--g-strong)]">Scheduled · {TASK_LABEL[t.action]} on {niceDate(t.due_date)}</span></li>)}
                  </ul>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-red-bg px-3 py-2 text-center font-semibold text-red">This invoice was cancelled. The stock went back and the customer&apos;s account was corrected.</p>
            )}
          </section>

          {/* ---------- items ---------- */}
          <section className="inv-card p-0">
            <table className="hidden w-full border-separate border-spacing-0 text-sm lg:table">
              <thead>
                <tr className="text-left text-[12.5px]">
                  <th className="inv-th w-10 rounded-tl-2xl px-3 py-2.5 text-center font-semibold">#</th>
                  <th className="inv-th px-2 py-2.5 font-semibold">Product</th>
                  <th className="inv-th px-2 py-2.5 text-right font-semibold">Qty</th>
                  <th className="inv-th px-2 py-2.5 text-right font-semibold">Rate</th>
                  <th className="inv-th px-2 py-2.5 text-right font-semibold">Disc</th>
                  <th className="inv-th px-2 py-2.5 text-right font-semibold">Amount</th>
                  <th className="inv-th rounded-tr-2xl px-3 py-2.5 font-semibold">{live ? "Pick from" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((i, k) => (
                  <tr key={i.id} className="align-top">
                    <td className="border-b border-[var(--g-line)] px-3 py-2.5 text-center text-muted">{k + 1}</td>
                    <td className="border-b border-[var(--g-line)] px-2 py-2.5">
                      <p className="font-medium leading-snug">{i.name} {i.market && <span className="pill bg-bg text-muted">Market</span>}</p>
                      {i.name_ur && <p className="ur text-sm text-muted">{i.name_ur}</p>}
                      {i.code_name && <p className="text-xs text-muted">{i.code_name}</p>}
                    </td>
                    <td className="whitespace-nowrap border-b border-[var(--g-line)] px-2 py-2.5 text-right font-semibold">{fmtQty(i.qty)}{Number(i.free) > 0 && <span className="ml-1 text-xs font-bold text-green">+{fmtQty(i.free)} free</span>}</td>
                    <td className="whitespace-nowrap border-b border-[var(--g-line)] px-2 py-2.5 text-right">{rs(i.price)}</td>
                    <td className="whitespace-nowrap border-b border-[var(--g-line)] px-2 py-2.5 text-right text-muted">{Number(i.disc_pct) > 0 ? i.disc_pct + "%" : ""}</td>
                    <td className="whitespace-nowrap border-b border-[var(--g-line)] px-2 py-2.5 text-right font-bold">{rs(i.qty * i.price - i.line_disc)}</td>
                    <td className="border-b border-[var(--g-line)] px-3 py-2.5 text-xs text-[color:var(--g-ink)]">
                      {live && i.allocs.map((a, j) => <p key={j}>{a.location}{a.racks.length ? " · rack " + a.racks.join(", ") : ""} × {fmtQty(a.qty)}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-[var(--g-line)] p-2 lg:hidden">
              {d.items.map((i) => (
                <li key={i.id} className="px-2 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{i.name} {i.market && <span className="pill bg-bg text-muted">Market</span>}</p>
                      {i.name_ur && <p className="ur text-sm text-muted">{i.name_ur}</p>}
                      <p className="text-xs text-muted">{fmtQty(i.qty)} × {rs(i.price)}{Number(i.disc_pct) > 0 ? " − " + i.disc_pct + "%" : ""}{Number(i.free) > 0 ? " · +" + fmtQty(i.free) + " free" : ""}</p>
                      {live && i.allocs.length > 0 && <p className="text-xs text-[color:var(--g-ink)]">Pick from: {i.allocs.map((a) => a.location + (a.racks.length ? " (rack " + a.racks.join(", ") + ")" : "") + " × " + fmtQty(a.qty)).join(" · ")}</p>}
                    </div>
                    <p className="font-bold">{rs(i.qty * i.price - i.line_disc)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-[var(--g-line)] px-5 py-2.5 text-xs text-muted">{d.items.length} item{d.items.length === 1 ? "" : "s"} · {fmtQty(pieces)} pieces{free ? " + " + fmtQty(free) + " free" : ""}</p>
          </section>
        </div>

        {/* ---------- money ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="inv-total p-5">
            <p className="text-xs uppercase tracking-wide opacity-80">Total bill</p>
            <p className="text-4xl font-bold leading-tight">{rs(s.total)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white/20 px-3 py-1">Paid <b>{rs(s.paid)}</b></span>
              {live && due > 0 && <span className="rounded-full px-3 py-1 font-bold" style={{ background: "#b91c1c", color: "#fff" }}>Due {rs(due)}</span>}
              {live && due <= 0 && <span className="rounded-full bg-white px-3 py-1 font-bold text-[color:var(--g-strong2)]">Paid in full</span>}
            </div>
            {d.payments.length > 0 && <p className="mt-2 text-xs opacity-90">{d.payments.map((p) => p.method + " " + rs(p.amount)).join(" · ")}</p>}
          </section>

          <section className="inv-card p-5">
            <h2 className="mb-2 font-semibold text-[color:var(--g-ink)]">Bill</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(gross)}</dd></div>
              {Number(s.line_discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Item discounts</dt><dd>− {rs(s.line_discount)}</dd></div>}
              {Number(s.discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Invoice discount</dt><dd>− {rs(s.discount)}</dd></div>}
              {Number(s.local_charges) > 0 && <div className="flex justify-between"><dt className="text-muted">Local charges</dt><dd>+ {rs(s.local_charges)}</dd></div>}
              {Number(s.bilti) > 0 && <div className="flex justify-between"><dt className="text-muted">Bilti</dt><dd>+ {rs(s.bilti)}</dd></div>}
              <div className="flex justify-between border-t border-[var(--g-line)] pt-2 text-base font-bold"><dt>Total</dt><dd>{rs(s.total)}</dd></div>
            </dl>
          </section>

          {!c?.is_walk_in && live && (
            <section className="inv-card p-5">
              <h2 className="mb-2 font-semibold text-[color:var(--g-ink)]">Customer account</h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Before this invoice</dt><dd>{rs(d.prev_balance)}</dd></div>
                <div className="flex justify-between text-base font-bold"><dt>Balance now</dt><dd className={d.final_balance > 0 ? "text-red" : ""}>{rs(d.final_balance)}</dd></div>
              </dl>
              {can("payments.receive") && d.final_balance > 0 && <button data-noprint className="btn mt-3 w-full" onClick={() => setCollect(true)}>Collect from customer</button>}
            </section>
          )}
        </aside>
      </div>

      {sched && <ScheduleModal saleId={id} no={s.no} onClose={() => { setSched(false); loadTasks(); }} onChanged={(m) => { setToast(m); load(); loadTasks(); }} />}
      {job && <PrintModal job={job} onClose={() => setJob(null)} />}
      {payInv && <PayInvoiceModal saleId={id} no={s.no} due={due} onClose={() => setPayInv(false)} onDone={(m) => { setPayInv(false); setToast(m); load(); }} />}
      {collect && c && <CollectModal customer={{ id: c.id, name: withArea(c.name, c.area?.name) }} onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
