"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { one } from "@/lib/field";
import { fmtDateTime, mapLink } from "@/lib/field-ui";
import { qty as fmtQty, rs } from "@/lib/format";
import { ProductPicker, type Prod } from "./InvoiceBuilder";
import { Loading, Spinner } from "./Loading";
import { useMe } from "./Me";
import { usePaymentMethods } from "./PaySplit";
import Toast from "./Toast";

type Who = { name: string } | { name: string }[] | null;
type Base = {
  id: string; no: string; status: "pending" | "approved" | "rejected" | "cancelled"; customer_id: string; customer_name: string; salesman: Who;
  created_at: string; reviewed_at: string | null; review_note: string | null; lat: number | null; lng: number | null;
};
type OLine = { product_id: string; name: string; qty: number; price: number };
type Order = Base & { term: "cash" | "credit"; lines: OLine[]; bilti: number; local_charges: number; discount: number; remarks: string | null; sale_id: string | null; sale: { no: string; total: number } | { no: string; total: number }[] | null };
type Pay = Base & { amount: number; approved_amount: number | null; method_id: string | null; method: string | null; note: string | null; payment: { no: number; amount: number } | { no: number; amount: number }[] | null };
type Ret = Base & { kind: "return" | "claim"; sale_id: string; sale_no: string; lines: { item_id: string; name: string; qty: number }[]; damaged: boolean; reason: string | null; ret: { no: string; amount: number } | { no: string; amount: number }[] | null };
type Req = Order | Pay | Ret;
type Tab = "orders" | "payments" | "returns";
type St = "pending" | "approved" | "rejected" | "all";

const TABS: [Tab, string][] = [["orders", "Orders"], ["payments", "Payments"], ["returns", "Returns & claims"]];
const STATUS: [St, string][] = [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]];
const PILL: Record<Base["status"], string> = { pending: "bg-amber-bg text-amber", approved: "bg-green-bg text-green", rejected: "bg-red-bg text-red", cancelled: "bg-line text-muted" };
const LABEL: Record<Base["status"], string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected", cancelled: "Withdrawn" };
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? NaN : Number(v));
const who = (r: Base) => one<{ name: string }>(r.salesman)?.name ?? "";

function summary(tab: Tab, r: Req) {
  if (tab === "orders") { const o = r as Order; return { big: rs(o.lines.reduce((s, l) => s + l.qty * l.price, 0)), small: o.lines.length + (o.lines.length === 1 ? " item" : " items") + " · estimate" }; }
  if (tab === "payments") { const p = r as Pay; return { big: rs(p.amount), small: p.method ?? "" }; }
  const t = r as Ret; return { big: t.kind === "claim" ? "Claim" : "Return", small: t.lines.length + (t.lines.length === 1 ? " item" : " items") + " · " + t.sale_no };
}

export default function ApprovalsView() {
  const [tab, setTab] = useState<Tab>("orders");
  const [status, setStatus] = useState<St>("pending");
  const [items, setItems] = useState<Req[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ orders: 0, payments: 0, returns: 0 });
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Req | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setItems(null);
    try {
      const [r, s] = await Promise.all([fetch("/api/requests/" + tab + "?status=" + status + "&limit=50"), fetch("/api/requests/summary")]);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the requests");
      const sj = await s.json().catch(() => null);
      setItems(j.items ?? []); setTotal(j.total ?? 0); setError("");
      if (s.ok && sj) setCounts({ orders: sj.orders ?? 0, payments: sj.payments ?? 0, returns: sj.returns ?? 0 });
    } catch (e) { setError((e as Error).message); setItems((x) => x ?? []); }
  }, [tab, status]);
  useEffect(() => { load(); }, [load]);
  // new requests appear by themselves while the office is looking at the waiting list
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(() => { if (!document.hidden) load(true); }, 30000);
    return () => clearInterval(t);
  }, [status, load]);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Approvals</h1>
        <p className="mb-2 text-sm text-muted">What salesmen send from the field. Nothing reaches stock or the customer account until you approve it.</p>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {TABS.map(([k, l]) => (
            <button key={k} className={"chip " + (tab === k ? "chip-on" : "")} onClick={() => setTab(k)}>
              {l}{counts[k] > 0 && <span className={"ml-2 rounded-full px-1.5 text-xs font-bold " + (tab === k ? "bg-accent-ink text-accent" : "bg-red text-bg")}>{counts[k]}</span>}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {STATUS.map(([k, l]) => <button key={k} className={"chip " + (status === k ? "chip-on" : "")} onClick={() => setStatus(k)}>{l}</button>)}
          <button className="chip ml-auto" onClick={() => load()} aria-label="Refresh">↻ Refresh</button>
        </div>
      </header>

      <div className="space-y-2 p-3 lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {items === null && <Loading />}
        {items && !items.length && !error && <p className="card p-4 text-sm text-muted">{status === "pending" ? "Nothing is waiting for approval." : "No requests here."}</p>}
        <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {items?.map((r) => {
            const s = summary(tab, r);
            return (
              <li key={r.id}>
                <button className="card block w-full p-3 text-left active:opacity-70" onClick={() => setOpen(r)}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.customer_name}</p>
                      <p className="text-xs text-muted">{r.no} · {who(r)} · {fmtDateTime(r.created_at)}</p>
                    </div>
                    <div className="text-right"><p className="font-bold">{s.big}</p><p className="text-xs text-muted">{s.small}</p></div>
                  </div>
                  {r.status !== "pending" && <p className="mt-2"><span className={"pill " + PILL[r.status]}>{LABEL[r.status]}</span>{r.review_note && <span className="ml-2 text-xs text-muted">{r.review_note}</span>}</p>}
                </button>
              </li>
            );
          })}
        </ul>
        {items && total > items.length && <p className="text-center text-sm text-muted">Showing the latest {items.length} of {total}.</p>}
      </div>

      {open && (
        <Sheet title={TABS.find((t) => t[0] === tab)![1].replace(" & claims", "") + " " + open.no} onClose={() => setOpen(null)}>
          {tab === "orders" && <OrderReview r={open as Order} onDone={(m) => { setOpen(null); setToast(m); load(true); }} />}
          {tab === "payments" && <PaymentReview r={open as Pay} onDone={(m) => { setOpen(null); setToast(m); load(true); }} />}
          {tab === "returns" && <ReturnReview r={open as Ret} onDone={(m) => { setOpen(null); setToast(m); load(true); }} />}
        </Sheet>
      )}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[94dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-2xl lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 text-base font-semibold">{title}</h2><button className="btn min-h-9" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

/** Who sent it, when, from where, and what the office already decided. */
function Head({ r }: { r: Base }) {
  return (
    <div className="mb-3 rounded-xl bg-bg p-3 text-sm">
      <p className="text-base font-semibold">{r.customer_name}</p>
      <p className="text-muted">From <b className="text-ink">{who(r)}</b> · {fmtDateTime(r.created_at)}
        {r.lat != null && r.lng != null && <> · <a className="underline" href={mapLink(r.lat, r.lng)} target="_blank" rel="noreferrer">where he was</a></>}</p>
      <p className="mt-1"><Link className="underline" href={"/customers/" + r.customer_id}>Customer account</Link></p>
      {r.status !== "pending" && (
        <p className="mt-2"><span className={"pill " + PILL[r.status]}>{LABEL[r.status]}</span>{r.reviewed_at && <span className="ml-2 text-xs text-muted">{fmtDateTime(r.reviewed_at)}</span>}{r.review_note && <span className="ml-2">{r.review_note}</span>}</p>
      )}
    </div>
  );
}

function useAct(type: Tab, id: string, onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: "approve" | "reject", body: object, okMsg: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/requests/" + type + "/" + id + "/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error || "Could not complete this");
      onDone(okMsg);
    } catch { setError("No connection. Try again."); } finally { setBusy(false); }
  }
  return { busy, error, act };
}

/** Approve button (the screen decides when it is allowed) and a Reject box that asks for the reason. */
function Footer({ pending, busy, error, canApprove, approveLabel, onApprove, onReject }: {
  pending: boolean; busy: boolean; error: string; canApprove: boolean; approveLabel: string; onApprove: () => void; onReject: (note: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  if (!pending) return null;
  return (
    <div className="mt-4">
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      {rejecting ? (
        <div>
          <label className="label" htmlFor="rej-note">Reason (the salesman will see it)</label>
          <input id="rej-note" className="input" autoFocus maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wrong customer, resend" />
          <div className="mt-2 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
            <button className="btn" onClick={() => setRejecting(false)}>Back</button>
            <button className="btn border-red bg-red-bg text-red" disabled={busy || !note.trim()} onClick={() => onReject(note.trim())}>{busy ? <><Spinner /> Rejecting…</> : "Reject request"}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" disabled={busy} onClick={() => setRejecting(true)}>Reject…</button>
          <button className="btn btn-primary" disabled={busy || !canApprove} onClick={onApprove}>{busy ? <><Spinner /> Working…</> : approveLabel}</button>
        </div>
      )}
    </div>
  );
}

type Row = { key: string; product_id: string; name: string; qty: string; price: string; orig: number };

function OrderReview({ r, onDone }: { r: Order; onDone: (m: string) => void }) {
  const { can } = useMe();
  const canDiscount = can("sales.discount");
  const pending = r.status === "pending";
  const sale = one(r.sale);
  const [rows, setRows] = useState<Row[]>(() => r.lines.map((l) => ({ key: crypto.randomUUID(), product_id: l.product_id, name: l.name, qty: String(l.qty), price: String(l.price), orig: l.price })));
  const [bilti, setBilti] = useState(String(r.bilti || ""));
  const [local, setLocal] = useState(String(r.local_charges || ""));
  const [discount, setDiscount] = useState(String(r.discount || ""));
  const [remarks, setRemarks] = useState(r.remarks ?? "");
  const [picking, setPicking] = useState(false);
  const { busy, error, act } = useAct("orders", r.id, onDone);

  const nums = rows.map((x) => ({ ...x, q: num(x.qty), p: num(x.price) }));
  const valid = nums.length > 0 && nums.every((x) => x.q > 0 && x.p >= 0);
  const lineChanged = rows.length !== r.lines.length || rows.some((x, i) => x.product_id !== r.lines[i]?.product_id || Number(x.qty) !== r.lines[i]?.qty);
  const priceChanged = rows.some((x) => Number(x.price) !== x.orig);
  const est = nums.reduce((s, x) => s + (x.q > 0 && x.p >= 0 ? x.q * x.p : 0), 0) + (num(bilti) || 0) + (num(local) || 0) - (canDiscount ? num(discount) || 0 : r.discount);

  function add(p: Prod) {
    setRows((xs) => xs.some((x) => x.product_id === p.id)
      ? xs.map((x) => (x.product_id === p.id ? { ...x, qty: String((Number(x.qty) || 0) + 1) } : x))
      : [...xs, { key: crypto.randomUUID(), product_id: p.id, name: p.name_en, qty: "1", price: String(p.cp), orig: p.cp }]);
  }
  function approve() {
    const body: Record<string, unknown> = { bilti: num(bilti) || 0, local_charges: num(local) || 0, remarks };
    if (canDiscount && discount.trim() !== "") body.discount = num(discount) || 0;
    // lines are sent only when the office changed them; a price is sent only when the office typed a different one
    if (lineChanged || priceChanged) body.lines = nums.map((x) => ({ product_id: x.product_id, qty: x.q, price: x.p !== x.orig ? x.p : null }));
    act("approve", body, "Approved: the invoice is now active");
  }

  return (
    <div>
      <Head r={r} />
      {sale && r.sale_id && <p className="mb-3 rounded-lg bg-green-bg p-2 text-sm text-green">Invoice <Link className="font-semibold underline" href={"/sales/" + r.sale_id}>{sale.no}</Link> · {rs(sale.total)}</p>}
      <p className="mb-1 text-sm text-muted">{r.term === "cash" ? "Cash sale" : "On credit"} · quantities and items can be changed before approving</p>
      <ul className="divide-y divide-line">
        {rows.map((x) => (
          <li key={x.key} className="py-2">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-medium leading-snug">{x.name}</p>
              {pending && <button className="btn min-h-9 px-3 text-red" aria-label={"Remove " + x.name} onClick={() => setRows((xs) => xs.filter((y) => y.key !== x.key))}>✕</button>}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <label className="text-xs text-muted" htmlFor={"q-" + x.key}>Qty</label>
              <input id={"q-" + x.key} className="input w-24 text-center" type="number" inputMode="decimal" min="0" step="any" disabled={!pending} value={x.qty} onChange={(e) => setRows((xs) => xs.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
              <label className="text-xs text-muted" htmlFor={"p-" + x.key}>Price</label>
              <input id={"p-" + x.key} className="input w-28 text-center" type="number" inputMode="decimal" min="0" step="any" disabled={!pending || !canDiscount} title={canDiscount ? "" : "Changing prices needs the discount permission"} value={x.price} onChange={(e) => setRows((xs) => xs.map((y) => (y.key === x.key ? { ...y, price: e.target.value } : y)))} />
              <span className="flex-1 text-right text-sm font-semibold">{x.qty && x.price && Number(x.qty) > 0 ? rs(Number(x.qty) * Number(x.price)) : ""}</span>
            </div>
          </li>
        ))}
      </ul>
      {pending && <button className="btn mt-2 w-full" onClick={() => setPicking(true)}>+ Add item</button>}
      {pending && !rows.length && <p className="mt-2 text-sm text-red">Add at least one item, or reject the request.</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="o-bilti">Bilti (Rs)</label><input id="o-bilti" className="input" type="number" inputMode="decimal" min="0" disabled={!pending} value={bilti} onChange={(e) => setBilti(e.target.value)} /></div>
        <div><label className="label" htmlFor="o-local">Local charges (Rs)</label><input id="o-local" className="input" type="number" inputMode="decimal" min="0" disabled={!pending} value={local} onChange={(e) => setLocal(e.target.value)} /></div>
        {canDiscount && <div className="col-span-2"><label className="label" htmlFor="o-disc">Discount on the invoice (Rs)</label><input id="o-disc" className="input" type="number" inputMode="decimal" min="0" disabled={!pending} value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>}
        <div className="col-span-2"><label className="label" htmlFor="o-rem">Remarks</label><input id="o-rem" className="input" maxLength={500} disabled={!pending} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </div>
      <p className="mt-3 text-lg font-bold">Estimate: {rs(Math.max(0, est))}</p>
      <p className="text-xs text-muted">At list prices. The final invoice applies your discounts and schemes, and checks stock when you approve.</p>

      <Footer pending={pending} busy={busy} error={error} canApprove={valid} approveLabel="Approve and create invoice" onApprove={approve} onReject={(note) => act("reject", { note }, "Request rejected")} />
      {picking && <ProductPicker onAdd={add} inInvoice={Object.fromEntries(rows.map((x) => [x.product_id, Number(x.qty) || 0]))} onClose={() => setPicking(false)} />}
    </div>
  );
}

function PaymentReview({ r, onDone }: { r: Pay; onDone: (m: string) => void }) {
  const pending = r.status === "pending";
  const pay = one(r.payment);
  const { methods } = usePaymentMethods();
  const [amount, setAmount] = useState(String(r.amount));
  const [methodId, setMethodId] = useState(r.method_id ?? "");
  const [bal, setBal] = useState<number | null>(null);
  const { busy, error, act } = useAct("payments", r.id, onDone);
  useEffect(() => {
    fetch("/api/customers/" + r.customer_id + "/ledger").then((x) => x.json()).then((j) => { if (typeof j.balance === "number") setBal(j.balance); }).catch(() => {});
  }, [r.customer_id]);
  const n = num(amount);
  const approve = () => act("approve", { amount: n !== r.amount ? n : undefined, method_id: methodId && methodId !== r.method_id ? methodId : undefined }, "Approved: added to the customer account");

  return (
    <div>
      <Head r={r} />
      {pay && <p className="mb-3 rounded-lg bg-green-bg p-2 text-sm text-green">Payment received: {rs(r.approved_amount ?? pay.amount)}</p>}
      {bal != null && <p className="mb-3 text-sm text-muted">Customer owes now: <b className="text-ink">{rs(bal)}</b></p>}
      <label className="label" htmlFor="p-amt">Amount received (Rs){n !== r.amount && pending ? " (salesman entered " + rs(r.amount) + ")" : ""}</label>
      <input id="p-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" step="any" disabled={!pending} value={amount} onChange={(e) => setAmount(e.target.value)} />
      {pending && bal != null && n > bal && <p className="mt-1 text-sm text-red">That is more than the customer owes ({rs(bal)}). Approving will be refused.</p>}
      <p className="label mt-3">Received by</p>
      <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
        {methods.length ? methods.map((m) => <button key={m.id} type="button" role="radio" aria-checked={methodId === m.id} disabled={!pending} className={"chip " + (methodId === m.id ? "chip-on" : "")} onClick={() => setMethodId(m.id)}>{m.name}</button>) : <span className="chip chip-on">{r.method ?? "—"}</span>}
      </div>
      {r.note && <p className="mt-3 text-sm"><span className="text-muted">Note: </span>{r.note}</p>}
      <Footer pending={pending} busy={busy} error={error} canApprove={n > 0 && !!methodId} approveLabel="Approve payment" onApprove={approve} onReject={(note) => act("reject", { note }, "Request rejected")} />
    </div>
  );
}

function ReturnReview({ r, onDone }: { r: Ret; onDone: (m: string) => void }) {
  const pending = r.status === "pending";
  const ret = one(r.ret);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(r.lines.map((l) => [l.item_id, String(l.qty)])));
  const [damaged, setDamaged] = useState(r.damaged);
  const { busy, error, act } = useAct("returns", r.id, onDone);
  const lines = r.lines.map((l) => ({ item_id: l.item_id, qty: (qty[l.item_id] ?? "").trim() === "" ? 0 : num(qty[l.item_id]) })); // an empty box means "not accepted"
  const valid = lines.some((l) => l.qty > 0) && lines.every((l, i) => Number.isNaN(l.qty) ? false : l.qty >= 0 && l.qty <= r.lines[i].qty);
  const changed = lines.some((l, i) => l.qty !== r.lines[i].qty);
  const approve = () => act("approve", { lines: changed ? lines.filter((l) => l.qty > 0) : undefined, damaged: damaged !== r.damaged ? damaged : undefined }, "Approved: customer credited");

  return (
    <div>
      <Head r={r} />
      <p className="mb-2 text-sm"><span className={"pill " + (r.kind === "claim" ? "bg-amber-bg text-amber" : "bg-bg text-ink")}>{r.kind === "claim" ? "Claim" : "Return"}</span> from invoice <Link className="font-semibold underline" href={"/sales/" + r.sale_id}>{r.sale_no}</Link></p>
      {ret && <p className="mb-3 rounded-lg bg-green-bg p-2 text-sm text-green">Recorded as {ret.no} · credit {rs(ret.amount)}</p>}
      <ul className="divide-y divide-line">
        {r.lines.map((l) => (
          <li key={l.item_id} className="py-2">
            <p className="font-medium leading-snug">{l.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex-1 text-xs text-muted">Salesman collected {fmtQty(l.qty)}</span>
              <input className="input w-24 text-center" type="number" inputMode="decimal" min="0" max={l.qty} step="any" disabled={!pending} value={qty[l.item_id] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [l.item_id]: e.target.value }))} aria-label={"Quantity accepted for " + l.name} />
            </div>
          </li>
        ))}
      </ul>
      <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" disabled={!pending} checked={damaged} onChange={(e) => setDamaged(e.target.checked)} /> Goods are damaged (do not put back in stock)</label>
      {r.reason && <p className="mt-2 text-sm"><span className="text-muted">Reason: </span>{r.reason}</p>}
      <p className="mt-2 text-xs text-muted">The credit to the customer is worked out from the invoice prices when you approve.</p>
      <Footer pending={pending} busy={busy} error={error} canApprove={valid} approveLabel="Approve and credit customer" onApprove={approve} onReject={(note) => act("reject", { note }, "Request rejected")} />
    </div>
  );
}
