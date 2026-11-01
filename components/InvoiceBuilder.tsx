"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { qty as fmtQty, rs } from "@/lib/format";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import { useMe } from "./Me";
import { Loading, LoadingBar, Spinner } from "./Loading";
import PaySplit, { newRow, paysTotal, toPayments, usePaymentMethods, type PayRow } from "./PaySplit";

export type Prod = { id: string; name_en: string; code_name: string | null; name_ur: string | null; unit: string; cp: number; scheme: string | null; on_hand: number; racks: string[] };
type Line = { key: string; p: Prod; qty: string; price: string; disc: string };
type Cust = { id: string; name: string; is_walk_in: boolean; credit_limit: number; balance: number; route: string | null };

const freeFor = (p: Prod, q: number) => {
  const m = /^(\d+)\+(\d+)$/.exec(p.scheme ?? "");
  return m && +m[1] > 0 && +m[2] > 0 ? Math.floor(q / +m[1]) * +m[2] : 0;
};
const money = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));

export default function InvoiceBuilder({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const { can } = useMe();
  const canDiscount = can("sales.discount");
  const { methods } = usePaymentMethods();
  const [kind, setKind] = useState<"counter" | "ledger">(customerId ? "ledger" : "counter");
  const [term, setTerm] = useState<"credit" | "cash">("credit");
  const [cust, setCust] = useState<Cust | null>(null);
  const [pickCust, setPickCust] = useState(false);
  const [pickProd, setPickProd] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [defPct, setDefPct] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState("");
  const [bilti, setBilti] = useState("");
  const [local, setLocal] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [rows, setRows] = useState<PayRow[]>([]);
  const [split, setSplit] = useState(false);
  const [receiveNow, setReceiveNow] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState<"" | "hold" | "pay" | "save">("");
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID());

  const cashId = (methods.find((m) => m.name.toLowerCase() === "cash") ?? methods[0])?.id ?? "";
  useEffect(() => { if (cashId && !rows.length) setRows([newRow(cashId)]); }, [cashId, rows.length]);
  function resetPay() { setRows(cashId ? [newRow(cashId)] : []); setSplit(false); setReceiveNow(false); }

  async function chooseCustomer(c: PickedCustomer) {
    setPickCust(false); setError("");
    const r = await fetch("/api/customers/" + c.id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the customer");
    const x = j.customer;
    setCust({ id: x.id, name: x.name, is_walk_in: !!x.is_walk_in, credit_limit: Number(x.credit_limit), balance: Number(x.balance), route: x.route?.name ?? null });
  }
  async function useWalkIn() {
    setError("");
    const r = await fetch("/api/customers/walkin");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not find the walk-in customer");
    await chooseCustomer({ id: j.customer.id, name: j.customer.name });
  }
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (customerId) chooseCustomer({ id: customerId, name: "" }); else useWalkIn();
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickKind(k: "counter" | "ledger") {
    if (k === kind) return;
    setKind(k); setError(""); resetPay();
    if (k === "counter") { if (!cust || !cust.is_walk_in) useWalkIn(); }
    else if (cust?.is_walk_in) setCust(null);
  }

  // default discounts for this customer (brand discount, or the customer's own deal)
  useEffect(() => {
    if (!cust || !lines.length) return;
    const ids = lines.map((l) => l.p.id).join(",");
    fetch("/api/sales/discounts?customer=" + cust.id + "&ids=" + ids).then((r) => r.json()).then((j) => j.pct && setDefPct(j.pct)).catch(() => {});
  }, [cust, lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function addProduct(p: Prod) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.p.id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(money(l.qty) + 1) } : l));
      return [...ls, { key: crypto.randomUUID(), p, qty: "1", price: "", disc: "" }];
    });
  }
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const calc = lines.map((l) => {
    const q = money(l.qty), price = l.price !== "" ? money(l.price) : l.p.cp, pct = l.disc !== "" ? money(l.disc) : defPct[l.p.id] ?? 0;
    const free = freeFor(l.p, q), ld = Math.round((q * price * pct) / 100);
    return { q, price, pct, free, ld, amount: q * price - ld, short: q + free > l.p.on_hand };
  });
  const gross = calc.reduce((s, c) => s + c.q * c.price, 0), ldisc = calc.reduce((s, c) => s + c.ld, 0);
  const total = gross - ldisc - money(discount) + Math.round(money(bilti)) + Math.round(money(local));

  const counter = kind === "counter";
  const walkIn = !!cust?.is_walk_in;
  // counter: the whole total is paid now.  ledger: optional money received now.
  const counterPays = toPayments(rows, split, total);
  const counterPaid = split ? Math.abs(paysTotal(rows) - total) < 0.005 && counterPays.length > 0 : counterPays.length > 0;
  const ledgerPaid = receiveNow ? paysTotal(rows) : 0;
  const due = counter ? 0 : total - ledgerPaid;
  const overLimit = !counter && !!cust && !walkIn && cust.credit_limit > 0 && due > 0 && cust.balance + due > cust.credit_limit;
  const baseReady = !!cust && lines.length > 0 && calc.every((c) => c.q > 0 && c.price > 0) && total >= 0 && !busy && (counter || !walkIn);
  const canPay = baseReady && total > 0 && counterPaid;
  const canSave = baseReady && ledgerPaid <= total && (!receiveNow || toPayments(rows, true, 0).length > 0 || ledgerPaid === 0);

  async function save(mode: "hold" | "pay" | "save") {
    if (!cust) return;
    setBusy(mode); setError("");
    const body = {
      customer_id: cust.id, kind, term, hold: mode === "hold", idem_key: idem, discount: money(discount), bilti: money(bilti), local_charges: money(local), remarks,
      contact_name: walkIn ? contactName : "", contact_phone: walkIn ? contactPhone : "",
      payments: mode === "hold" ? [] : counter ? counterPays : receiveNow ? toPayments(rows, true, 0) : [],
      lines: lines.map((l) => ({ product_id: l.p.id, qty: money(l.qty), price: l.price !== "" ? money(l.price) : undefined, disc_pct: l.disc !== "" ? money(l.disc) : undefined })),
    };
    const r = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setError(j.error || "Could not save the invoice");
    router.replace("/sales/" + j.id);
  }

  return (
    <div>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/sales" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <div className="min-w-0 flex-1"><h1 className="text-base font-bold leading-tight">{counter ? "Counter sale" : "Ledger sale"}</h1><p className="text-xs text-muted">Total {rs(total)}</p></div>
        {counter ? (
          <>
            <button className="btn" disabled={!baseReady} onClick={() => save("hold")}>{busy === "hold" ? <><Spinner /> Holding…</> : "Hold"}</button>
            <button className="btn btn-primary" disabled={!canPay} onClick={() => save("pay")}>{busy === "pay" ? <><Spinner /> Saving…</> : "Pay & complete"}</button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={!baseReady || !canSave} onClick={() => save("save")}>{busy === "save" ? <><Spinner /> Saving…</> : "Save invoice"}</button>
        )}
      </header>

      <div className="space-y-3 p-3 lg:max-w-3xl lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        <div role="radiogroup" aria-label="Sale type" className="grid grid-cols-2 gap-2">
          {([["counter", "Counter sale", "Paid now. Can be put on hold."], ["ledger", "Ledger sale", "Delivered later, cash or credit."]] as const).map(([k, label, note]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pickKind(k)}
              className={"rounded-xl border p-3 text-left active:opacity-70 " + (kind === k ? "border-accent ring-2 ring-accent" : "border-line bg-surface")}>
              <span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{note}</span>
            </button>
          ))}
        </div>

        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Customer</h2>
          {cust ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{walkIn ? "Walk-in customer" : cust.name}{walkIn && <span className="ml-2 pill bg-bg text-muted">Counter</span>}</p>
                  {!walkIn && (
                    <p className="text-sm text-muted">{cust.route ? cust.route + " · " : ""}Balance <b className={cust.balance > 0 ? "text-red" : "text-ink"}>{rs(cust.balance)}</b>{cust.credit_limit > 0 ? " · limit " + rs(cust.credit_limit) : ""}</p>
                  )}
                </div>
                {counter && !walkIn ? <button className="btn min-h-9 px-3" onClick={useWalkIn}>Walk-in</button> : null}
                {(!counter || !walkIn) && <button className="btn min-h-9 px-3" onClick={() => setPickCust(true)}>Change</button>}
                {counter && walkIn && <button className="btn min-h-9 px-3" onClick={() => setPickCust(true)}>Registered customer</button>}
              </div>
              {walkIn && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="ct-name">Name (optional)</label><input id="ct-name" className="input" maxLength={80} value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
                  <div><label className="label" htmlFor="ct-phone">Phone (optional)</label><input id="ct-phone" className="input" type="tel" inputMode="tel" maxLength={30} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
                  <p className="col-span-2 -mt-1 text-xs text-muted">Printed on this invoice only. It does not create a customer.</p>
                </div>
              )}
            </div>
          ) : cust === null && counter && !error ? (
            <Loading label="Loading…" className="py-2" />
          ) : (
            <button className="btn btn-primary w-full" onClick={() => setPickCust(true)}>Choose customer</button>
          )}
          {!counter && (
            <div className="mt-3">
              <p className="label">This invoice is</p>
              <div role="radiogroup" aria-label="Cash or credit" className="flex gap-2">
                {([["credit", "Credit"], ["cash", "Cash"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={term === k} className={"chip " + (term === k ? "chip-on" : "")} onClick={() => setTerm(k)}>{label}</button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{term === "cash" ? "Cash: the money is collected when the goods are delivered." : "Credit: the amount goes on the customer's account."}</p>
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Items</h2>
            <button className="btn btn-primary min-h-9 px-3" onClick={() => setPickProd(true)}>＋ Add item</button></div>
          {!lines.length && <p className="py-3 text-center text-sm text-muted">No items yet. Tap “Add item” and search by name, code or Urdu name.</p>}
          <ul className="divide-y divide-line">
            {lines.map((l, i) => {
              const c = calc[i];
              return (
                <li key={l.key} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{l.p.name_en}</p>
                      {l.p.name_ur && <p className="ur text-sm text-muted">{l.p.name_ur}</p>}
                      <p className="text-xs text-muted">{rs(c.price)} each · stock {fmtQty(l.p.on_hand)}{l.p.racks.length ? " · rack " + l.p.racks.join(", ") : ""}</p>
                    </div>
                    <button className="btn min-h-9 border-0 bg-transparent px-2 text-muted" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={"Remove " + l.p.name_en}>✕</button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn size-11 min-h-11 px-0 text-xl" onClick={() => upd(l.key, { qty: String(Math.max(0, money(l.qty) - 1)) })} aria-label="Less">−</button>
                    <input className="input w-20 text-center text-lg font-semibold" type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} aria-label={"Quantity of " + l.p.name_en} />
                    <button className="btn size-11 min-h-11 px-0 text-xl" onClick={() => upd(l.key, { qty: String(money(l.qty) + 1) })} aria-label="More">＋</button>
                    <span className="flex-1 text-right text-lg font-semibold">{rs(c.amount)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    {c.free > 0 && <span className="pill bg-green-bg text-green">+{c.free} free</span>}
                    {c.pct > 0 && <span className="pill bg-bg text-muted">{c.pct}% off</span>}
                    {c.short && <span className="pill bg-amber-bg text-amber">Only {fmtQty(l.p.on_hand)} in stock</span>}
                  </div>
                  {canDiscount && (
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-muted">Change price or discount</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div><label className="label" htmlFor={"pr" + l.key}>Price (Rs)</label><input id={"pr" + l.key} className="input" type="number" inputMode="decimal" min="0" placeholder={String(l.p.cp)} value={l.price} onChange={(e) => upd(l.key, { price: e.target.value })} /></div>
                        <div><label className="label" htmlFor={"ds" + l.key}>Discount %</label><input id={"ds" + l.key} className="input" type="number" inputMode="decimal" min="0" max="100" placeholder={String(defPct[l.p.id] ?? 0)} value={l.disc} onChange={(e) => upd(l.key, { disc: e.target.value })} /></div>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Total and payment</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(gross)}</dd></div>
            {ldisc > 0 && <div className="flex justify-between"><dt className="text-muted">Item discounts</dt><dd>− {rs(ldisc)}</dd></div>}
            {money(discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Invoice discount</dt><dd>− {rs(money(discount))}</dd></div>}
            {money(local) > 0 && <div className="flex justify-between"><dt className="text-muted">Local charges (inside city)</dt><dd>+ {rs(Math.round(money(local)))}</dd></div>}
            {money(bilti) > 0 && <div className="flex justify-between"><dt className="text-muted">Bilti (outside city)</dt><dd>+ {rs(Math.round(money(bilti)))}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold"><dt>Total</dt><dd>{rs(total)}</dd></div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            {canDiscount && <div className="col-span-2"><label className="label" htmlFor="inv-disc">Invoice discount (Rs)</label><input id="inv-disc" className="input" type="number" inputMode="decimal" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>}
            <div><label className="label" htmlFor="inv-local">Local charges (Rs)</label><input id="inv-local" className="input" type="number" inputMode="numeric" min="0" placeholder="Delivery in city" value={local} onChange={(e) => setLocal(e.target.value)} /></div>
            <div><label className="label" htmlFor="inv-bilti">Bilti (Rs)</label><input id="inv-bilti" className="input" type="number" inputMode="numeric" min="0" placeholder="Delivery outside city" value={bilti} onChange={(e) => setBilti(e.target.value)} /></div>
          </div>

          {counter && (
            <div>
              <p className="label">Paid by</p>
              <PaySplit methods={methods} rows={rows} setRows={setRows} split={split} setSplit={setSplit} total={total} mode="full" />
              <p className="mt-2 text-xs text-muted">“Pay &amp; complete” takes the payment and completes the sale. “Hold” keeps it Active without payment; stock is deducted now and comes back if you cancel.</p>
            </div>
          )}
          {!counter && cust && !walkIn && (
            <div>
              {!receiveNow ? (
                <button type="button" className="btn w-full" onClick={() => { setReceiveNow(true); if (!rows.length && cashId) setRows([newRow(cashId)]); }}>Money received now (optional)</button>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between"><p className="label mb-0">Received now</p><button type="button" className="text-sm text-muted underline" onClick={resetPay}>None</button></div>
                  <PaySplit methods={methods} rows={rows} setRows={setRows} split setSplit={setSplit} total={total} mode="amount" />
                  {ledgerPaid > total && <p className="mt-1 text-sm text-red">More than the invoice total.</p>}
                </>
              )}
              <p className="mt-2 text-sm text-muted">{term === "cash" ? "To collect on delivery" : "Goes on credit"}: <b className="text-ink">{rs(Math.max(due, 0))}</b></p>
              {overLimit && <p className="mt-1 rounded-lg bg-amber-bg p-2 text-sm text-amber">This would take the customer over the credit limit of {rs(cust.credit_limit)}. The invoice will be refused.</p>}
            </div>
          )}
          <div><label className="label" htmlFor="inv-rem">Remarks (optional)</label><input id="inv-rem" className="input" maxLength={500} placeholder="For example: BY HAND" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </section>
      </div>

      {pickCust && <CustomerPicker allowAdd onPick={chooseCustomer} onClose={() => setPickCust(false)} />}
      {pickProd && <ProductPicker onAdd={addProduct} inInvoice={Object.fromEntries(lines.map((l) => [l.p.id, money(l.qty)]))} onClose={() => setPickProd(false)} />}
    </div>
  );
}

export function ProductPicker({ onAdd, inInvoice, onClose, allowNoPrice }: { onAdd: (p: Prod) => void; inInvoice: Record<string, number>; onClose: () => void; allowNoPrice?: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const req = useRef(0);
  useEffect(() => {
    const t = setTimeout(async () => {
      const id = ++req.current;
      setLoading(true); setError("");
      try {
        const r = await fetch("/api/inventory/products?limit=30&q=" + encodeURIComponent(q));
        const j = await r.json();
        if (id !== req.current) return;
        if (!r.ok) throw new Error(j.error || "Could not load parts");
        setRows(j.items);
      } catch (e) { if (id === req.current) setError((e as Error).message); }
      finally { if (id === req.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Add item" onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-xl lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2">
          <input className="input" autoFocus type="text" inputMode="search" placeholder="Name, code, Urdu name or rack" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search parts" />
          <button className="btn btn-primary shrink-0 px-4" onClick={onClose}>Done</button>
        </div>
        <LoadingBar active={loading} className="mb-2" />
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
          {rows.map((p) => {
            const n = inInvoice[p.id];
            return (
              <li key={p.id}>
                <button className="flex min-h-16 w-full items-center gap-2 py-2 text-left active:bg-bg disabled:opacity-50" disabled={!allowNoPrice && !(p.cp > 0)} onClick={() => onAdd(p)}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{p.name_en}</span>
                    {p.name_ur && <span className="ur block text-sm text-muted">{p.name_ur}</span>}
                    <span className="block text-xs text-muted">{p.scheme ? "Scheme " + p.scheme + " · " : ""}{p.racks.length ? "Rack " + p.racks.join(", ") : ""}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{p.cp > 0 ? rs(p.cp) : "No price"}</span>
                    <span className={"pill " + (p.on_hand > 0 ? "bg-green-bg text-green" : "bg-red-bg text-red")}>{fmtQty(p.on_hand)} {p.unit}</span>
                    {n ? <span className="block text-xs text-accent">In invoice × {n}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {loading && !rows.length && !error && <Loading label={q.trim() ? "Searching…" : "Loading…"} />}
        {error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
        {!loading && !error && !rows.length && <p className="py-4 text-center text-sm text-muted">No part matches.</p>}
      </div>
    </div>
  );
}
