"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { qty as fmtQty, rs } from "@/lib/format";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import { MarketModal, ProductPicker, type Prod } from "./InvoiceBuilder";
import { Spinner } from "./Loading";
import { useMe } from "./Me";
import PaySplit, { newRow, paysTotal, toPayments, usePaymentMethods, type PayRow } from "./PaySplit";

/*
 * Keyboard-first invoice screen for the desktop (the phone keeps the touch form).
 *  customer: type, Enter  ->  product: type, Enter  ->  quantity, Enter  ->  next row.
 *  F2 counter/ledger   F3 customer   F4 payment (counter) or cash/credit (ledger)   F7 buy from market
 *  F8 hold   F9 list   F10 save (Shift+F10 save and print)   Shift+F6 delete row   Up/Down rows
 */

type Row = { key: string; p?: Prod; q: string; price: string; disc: string; market?: { cost: number; vendor: string } };
type Cust = { id: string; name: string; is_walk_in: boolean; credit_limit: number; balance: number; route: string | null };
type CustHit = { id: string; code: string; name: string; owner: string | null; phone: string | null; balance: number; route: { name: string } | null };

const blank = (): Row => ({ key: crypto.randomUUID(), q: "", price: "", disc: "" });
const money = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const freeFor = (p: Prod, q: number) => {
  const m = /^(\d+)\+(\d+)$/.exec(p.scheme ?? "");
  return m && +m[1] > 0 && +m[2] > 0 ? Math.floor(q / +m[1]) * +m[2] : 0;
};

/** Search as you type. Results count only when they belong to the text now in the box. */
function useSearch<T>(path: string, q: string, enabled: boolean, limit = 8) {
  const [state, setState] = useState<{ q: string; items: T[] }>({ q: "\u0000", items: [] });
  const req = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      const id = ++req.current;
      try {
        const r = await fetch(path + "?limit=" + limit + "&q=" + encodeURIComponent(q));
        const j = await r.json();
        if (id === req.current && r.ok) setState({ q, items: j.items ?? [] });
      } catch { /* the next keystroke retries */ }
    }, 120);
    return () => clearTimeout(t);
  }, [path, q, enabled, limit]);
  return { items: state.q === q ? state.items : [], ready: state.q === q };
}

const Key = ({ k }: { k: string }) => <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">{k}</kbd>;

export default function InvoiceGrid({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const { can } = useMe();
  const canDiscount = can("sales.discount");
  const { methods } = usePaymentMethods();

  const [kind, setKind] = useState<"counter" | "ledger">(customerId ? "ledger" : "counter");
  const [term, setTerm] = useState<"credit" | "cash">("credit");
  const [cust, setCust] = useState<Cust | null>(null);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [defPct, setDefPct] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState("");
  const [local, setLocal] = useState("");
  const [bilti, setBilti] = useState("");
  const [remarks, setRemarks] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pay, setPay] = useState<PayRow[]>([]);
  const [split, setSplit] = useState(false);
  const [recv, setRecv] = useState("");
  const [recvMethod, setRecvMethod] = useState("");
  const [modal, setModal] = useState<"" | "cust" | "prod" | "market">("");
  const [pickRow, setPickRow] = useState("");
  const [busy, setBusy] = useState<"" | "hold" | "save" | "print">("");
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID());

  const cells = useRef<Record<string, HTMLElement | null>>({});
  const reg = (id: string) => (el: HTMLElement | null) => { cells.current[id] = el; };
  const focus = useCallback((id: string) => { setTimeout(() => { const el = cells.current[id]; el?.focus(); if (el instanceof HTMLInputElement) el.select(); }, 0); }, []);

  const cashId = (methods.find((m) => m.name.toLowerCase() === "cash") ?? methods[0])?.id ?? "";
  useEffect(() => { if (cashId && !pay.length) setPay([newRow(cashId)]); if (cashId && !recvMethod) setRecvMethod(cashId); }, [cashId, pay.length, recvMethod]);

  /* ---------- customer ---------- */
  const chooseCustomer = useCallback(async (c: PickedCustomer, thenFocus = true) => {
    setError("");
    const r = await fetch("/api/customers/" + c.id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the customer");
    const x = j.customer;
    setCust({ id: x.id, name: x.name, is_walk_in: !!x.is_walk_in, credit_limit: Number(x.credit_limit), balance: Number(x.balance), route: x.route?.name ?? null });
    if (thenFocus) focus("prod:0");
  }, [focus]);
  const useWalkIn = useCallback(async (thenFocus = false) => {
    const r = await fetch("/api/customers/walkin");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not find the walk-in customer");
    await chooseCustomer({ id: j.customer.id, name: j.customer.name }, thenFocus);
  }, [chooseCustomer]);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (customerId) chooseCustomer({ id: customerId, name: "" }); else { useWalkIn(); focus("cust"); }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickKind(k: "counter" | "ledger") {
    if (k === kind) return;
    setKind(k); setError(""); setSplit(false); setRecv("");
    if (k === "counter") { if (!cust || !cust.is_walk_in) useWalkIn(); }
    else if (cust?.is_walk_in) { setCust(null); focus("cust"); }
  }

  /* ---------- rows ---------- */
  const idx = (key: string) => rows.findIndex((r) => r.key === key);
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  function setProduct(key: string, p: Prod, extra: Partial<Row> = {}) {
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, p, ...extra } : r));
      return next[next.length - 1].p ? [...next, blank()] : next;
    });
    focus("qty:" + key);
  }
  function removeRow(key: string) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const next = rs.filter((r) => r.key !== key);
      if (!next.length || next[next.length - 1].p) next.push(blank());
      focus("prod:" + next[Math.min(i, next.length - 1)].key);
      return next;
    });
  }
  const rowCell = (r: Row, col: "prod" | "qty" | "price" | "disc") => col + ":" + r.key;
  // "prod:0" is the first row, so the customer step can find it before keys exist
  useEffect(() => { cells.current["prod:0"] = cells.current["prod:" + rows[0].key]; });
  function goRow(from: Row, delta: number, col: "prod" | "qty" | "price" | "disc") {
    const t = rows[idx(from.key) + delta];
    if (t) focus(rowCell(t, t.p ? col : "prod"));
  }
  const nextRowProduct = (from: Row) => { const t = rows[idx(from.key) + 1]; if (t) focus(rowCell(t, "prod")); else focus("disc"); };

  useEffect(() => {
    const ids = rows.filter((r) => r.p).map((r) => r.p!.id);
    if (!cust || !ids.length) return;
    fetch("/api/sales/discounts?customer=" + cust.id + "&ids=" + ids.join(",")).then((r) => r.json()).then((j) => j.pct && setDefPct(j.pct)).catch(() => {});
  }, [cust, rows.filter((r) => r.p).length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- numbers ---------- */
  const calc = rows.map((r) => {
    if (!r.p) return null;
    const q = money(r.q), price = r.price !== "" ? money(r.price) : r.p.cp, pct = r.disc !== "" ? money(r.disc) : defPct[r.p.id] ?? 0;
    const free = freeFor(r.p, q), ld = Math.round((q * price * pct) / 100);
    return { q, price, pct, free, ld, value: q * price - ld, tot: q + free, after: r.market ? null : r.p.on_hand - (q + free) };
  });
  const filled = rows.map((r, i) => ({ r, c: calc[i] })).filter((x): x is { r: Row; c: NonNullable<(typeof calc)[number]> } => !!x.c);
  const gross = filled.reduce((s, x) => s + x.c.q * x.c.price, 0), ldisc = filled.reduce((s, x) => s + x.c.ld, 0);
  const totQty = filled.reduce((s, x) => s + x.c.q, 0), freeQty = filled.reduce((s, x) => s + x.c.free, 0);
  const total = gross - ldisc - money(discount) + Math.round(money(bilti)) + Math.round(money(local));

  const counter = kind === "counter";
  const walkIn = !!cust?.is_walk_in;
  const counterPays = toPayments(pay, split, total);
  const counterOk = split ? Math.abs(paysTotal(pay) - total) < 0.005 && counterPays.length > 0 : counterPays.length > 0;
  const received = counter ? total : Math.min(money(recv), total);
  const balanceAfter = cust && !walkIn ? cust.balance + total - (counter ? total : money(recv)) : 0;
  const problem = !cust ? "Choose a customer" : !filled.length ? "Add at least one item" : filled.some((x) => x.c.q <= 0) ? "Enter a quantity for every item" : filled.some((x) => x.c.price <= 0) ? "An item has no price" : !counter && walkIn ? "Choose a customer for a ledger sale" : "";
  const canSave = !problem && !busy && total >= 0;
  const canPay = canSave && total > 0 && counterOk;
  const overLimit = !counter && !!cust && !walkIn && cust.credit_limit > 0 && total - money(recv) > 0 && cust.balance + total - money(recv) > cust.credit_limit;

  async function save(mode: "hold" | "save" | "print") {
    if (!cust || busy) return;
    if (mode !== "hold" && counter && !canPay) return setError(problem || "Pay the full amount to complete the sale");
    if (problem) return setError(problem);
    setBusy(mode); setError("");
    const hold = mode === "hold";
    const body = {
      customer_id: cust.id, kind, term, hold, idem_key: idem, discount: money(discount), bilti: money(bilti), local_charges: money(local), remarks,
      contact_name: walkIn ? contactName : "", contact_phone: walkIn ? contactPhone : "",
      payments: hold ? [] : counter ? counterPays : money(recv) > 0 && recvMethod ? [{ method_id: recvMethod, amount: Math.min(money(recv), total) }] : [],
      lines: filled.map(({ r }) => ({ product_id: r.p!.id, qty: money(r.q), price: r.price !== "" ? money(r.price) : undefined, disc_pct: r.disc !== "" ? money(r.disc) : undefined, market: r.market })),
    };
    const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(j.error || "Could not save the invoice");
    router.replace("/sales/" + j.id + (mode === "print" ? "?print=1" : ""));
  }

  /* ---------- shortcut keys ---------- */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (modal) return;
    const el = document.activeElement as HTMLElement | null;
    const rowKey = el?.dataset?.row;
    const run = (fn: () => void) => { e.preventDefault(); fn(); };
    if (e.key === "F2") run(() => pickKind(counter ? "ledger" : "counter"));
    else if (e.key === "F3") run(() => focus("cust"));
    else if (e.key === "F4") run(() => {
      if (counter) {
        if (!methods.length) return;
        const cur = pay[0]?.method_id; const i = methods.findIndex((m) => m.id === cur);
        setSplit(false); setPay([{ ...(pay[0] ?? newRow(methods[0].id)), method_id: methods[(i + 1) % methods.length].id, amount: "" }]);
      } else setTerm(term === "cash" ? "credit" : "cash");
    });
    else if (e.key === "F7") run(() => setModal("market"));
    else if (e.key === "F8") run(() => { if (counter) save("hold"); });
    else if (e.key === "F9") run(() => { if (el?.dataset?.cell === "cust") setModal("cust"); else { setPickRow(rowKey ?? rows.find((r) => !r.p)?.key ?? ""); setModal("prod"); } });
    else if (e.key === "F10") run(() => save(e.shiftKey ? "print" : "save"));
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") run(() => save("save"));
    else if (e.key === "F6" && e.shiftKey) run(() => { if (rowKey && rows.find((r) => r.key === rowKey)?.p) removeRow(rowKey); });
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  /* ---------- footer: Enter walks down the fields, then lands on Save ---------- */
  const flow = useMemo(() => [canDiscount ? "disc" : "", "local", "bilti", "remarks", counter ? "" : "recv", "save"].filter(Boolean), [canDiscount, counter]);
  const nextField = (cur: string) => focus(flow[flow.indexOf(cur) + 1] ?? "save");
  const enterTo = (cur: string) => (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); nextField(cur); } };

  const th = "border-b border-line bg-bg px-1.5 py-1.5 text-left text-[12px] font-semibold text-muted";
  const cell = "h-9 w-full rounded border border-transparent bg-transparent px-1.5 text-sm outline-none focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent";

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-3 p-4">
      {/* top strip */}
      <section className="card grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-2 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Sale <Key k="F2" /></span>
          <div role="radiogroup" aria-label="Sale type" className="flex gap-1">
            {([["counter", "Counter"], ["ledger", "Ledger"]] as const).map(([k, l]) => (
              <button key={k} type="button" tabIndex={-1} role="radio" aria-checked={kind === k} onClick={() => pickKind(k)} className={"chip " + (kind === k ? "chip-on" : "")}>{l}</button>
            ))}
          </div>
          {!counter && (
            <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Cash or credit">
              {([["credit", "Credit"], ["cash", "Cash"]] as const).map(([k, l]) => <button key={k} type="button" tabIndex={-1} role="radio" aria-checked={term === k} onClick={() => setTerm(k)} className={"chip " + (term === k ? "chip-on" : "")}>{l}</button>)}
              <Key k="F4" />
            </div>
          )}
        </div>

        <CustomerBox cust={cust} kind={kind} reg={reg} onPick={(c) => chooseCustomer(c)} onEmptyEnter={() => focus("prod:0")} />

        <div className="min-w-48 text-right">
          <p className="text-xs text-muted">Previous balance</p>
          <p className={"text-xl font-bold " + (cust && !walkIn && cust.balance > 0 ? "text-red" : "")}>{cust && !walkIn ? rs(cust.balance) : "—"}</p>
          {cust && !walkIn && <p className="text-xs text-muted">{cust.route ? cust.route + " · " : ""}{cust.credit_limit > 0 ? "limit " + rs(cust.credit_limit) : "no limit"}</p>}
        </div>

        {walkIn && (
          <div className="col-span-3 grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="g-cname">Customer name (optional, printed on this invoice only)</label><input id="g-cname" className="input" maxLength={80} value={contactName} onChange={(e) => setContactName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("g-cphone")?.focus(); } }} /></div>
            <div><label className="label" htmlFor="g-cphone">Phone (optional)</label><input id="g-cphone" className="input" type="tel" maxLength={30} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focus("prod:0"); } }} /></div>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

      {/* items grid */}
      <section className="card p-0">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col style={{ width: "2.2rem" }} /><col /><col style={{ width: "5.5rem" }} /><col style={{ width: "6rem" }} /><col style={{ width: "5rem" }} /><col style={{ width: "6.5rem" }} /><col style={{ width: "4rem" }} /><col style={{ width: "4.5rem" }} /><col style={{ width: "8rem" }} /><col style={{ width: "7rem" }} /></colgroup>
          <thead>
            <tr><th className={th}>#</th><th className={th}>Product</th><th className={th + " text-right"}>Qty</th><th className={th + " text-right"}>Price</th><th className={th + " text-right"}>Disc %</th><th className={th + " text-right"}>Value</th><th className={th + " text-right"}>Free</th><th className={th + " text-right"}>Total</th><th className={th + " text-right"}>Stock before → after</th><th className={th}>Rack</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = calc[i];
              return (
                <tr key={r.key} className="border-b border-line align-middle even:bg-bg">
                  <td className="px-1.5 text-center text-xs text-muted">{r.p ? i + 1 : ""}</td>
                  <td className="relative px-1 py-0.5">
                    <ProductCell row={r} reg={reg} onPick={(p) => setProduct(r.key, p)} onClear={() => patch(r.key, { p: undefined, market: undefined })}
                      onEmptyEnter={() => (filled.length ? focus("disc") : undefined)} onArrow={(d) => goRow(r, d, "prod")} />
                  </td>
                  <td className="px-1 py-0.5"><input ref={reg("qty:" + r.key)} data-row={r.key} data-cell="qty" disabled={!r.p} className={cell + " text-right"} inputMode="decimal" aria-label={"Quantity, row " + (i + 1)} value={r.q} onChange={(e) => patch(r.key, { q: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (money(r.q) > 0) nextRowProduct(r); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "qty"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "qty"); } else if (e.key === "Backspace" && r.q === "") { e.preventDefault(); focus("prod:" + r.key); } }} /></td>
                  <td className="px-1 py-0.5"><input ref={reg("price:" + r.key)} data-row={r.key} data-cell="price" disabled={!r.p} readOnly={!canDiscount || !!r.market} className={cell + " text-right"} inputMode="decimal" aria-label={"Price, row " + (i + 1)} value={r.price !== "" ? r.price : r.p ? String(r.p.cp) : ""} onChange={(e) => patch(r.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextRowProduct(r); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "price"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "price"); } }} /></td>
                  <td className="px-1 py-0.5"><input ref={reg("disc:" + r.key)} data-row={r.key} data-cell="disc" disabled={!r.p} readOnly={!canDiscount || !!r.market} className={cell + " text-right"} inputMode="decimal" aria-label={"Discount percent, row " + (i + 1)} value={r.disc !== "" ? r.disc : c && c.pct ? String(c.pct) : ""} onChange={(e) => patch(r.key, { disc: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextRowProduct(r); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "disc"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "disc"); } }} /></td>
                  <td className="px-2 text-right text-sm font-semibold">{c ? rs(c.value) : ""}</td>
                  <td className="px-2 text-right text-sm text-green">{c && c.free > 0 ? "+" + c.free : ""}</td>
                  <td className="px-2 text-right text-sm">{c && c.q > 0 ? fmtQty(c.tot) : ""}</td>
                  <td className="px-2 text-right text-sm">{c && r.p ? (c.after === null ? <span className="text-muted">market</span> : <><span className="text-muted">{fmtQty(r.p.on_hand)}</span> → <b className={c.after < 0 ? "text-red" : ""}>{fmtQty(c.after)}</b></>) : ""}</td>
                  <td className="truncate px-1.5 text-xs text-muted" title={r.p?.racks.join(", ")}>{r.p?.racks.join(", ")}{r.market && <span className="pill bg-bg text-ink">Market · cost {rs(r.market.cost)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* totals and payment */}
      <section className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
        <div className="card grid grid-cols-3 gap-4 p-3 text-center">
          {[["Total qty", fmtQty(totQty)], ["Free qty", fmtQty(freeQty)], ["Items", String(filled.length)]].map(([l, v]) => <div key={l}><p className="text-xs text-muted">{l}</p><p className="text-2xl font-bold">{v}</p></div>)}
        </div>

        <div className="card grid grid-cols-4 gap-3 p-3">
          {canDiscount && <div><label className="label" htmlFor="g-disc">Discount (Rs)</label><input id="g-disc" ref={reg("disc")} className="input text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={enterTo("disc")} /></div>}
          <div><label className="label" htmlFor="g-local">Local charges</label><input id="g-local" ref={reg("local")} className="input text-right" inputMode="numeric" placeholder="inside city" value={local} onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={enterTo("local")} /></div>
          <div><label className="label" htmlFor="g-bilti">Bilti</label><input id="g-bilti" ref={reg("bilti")} className="input text-right" inputMode="numeric" placeholder="outside city" value={bilti} onChange={(e) => setBilti(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={enterTo("bilti")} /></div>
          <div className={canDiscount ? "" : "col-span-2"}><label className="label" htmlFor="g-rem">Remarks</label><input id="g-rem" ref={reg("remarks")} className="input" maxLength={500} placeholder="BY HAND" value={remarks} onChange={(e) => setRemarks(e.target.value)} onKeyDown={enterTo("remarks")} /></div>

          <div className="col-span-4 border-t border-line pt-3">
            {counter ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">Paid by <Key k="F4" /></span>
                <div className="min-w-0 flex-1"><PaySplit methods={methods} rows={pay} setRows={setPay} split={split} setSplit={setSplit} total={total} mode="full" /></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold" htmlFor="g-recv">Cash received now</label>
                <input id="g-recv" ref={reg("recv")} className="input w-40 text-right text-lg font-semibold" inputMode="decimal" value={recv} onChange={(e) => setRecv(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={enterTo("recv")} />
                <select className="input w-40" aria-label="Received by" value={recvMethod} onChange={(e) => setRecvMethod(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                <span className="text-sm text-muted">{term === "cash" ? "Rest is collected on delivery" : "Rest goes on credit"}</span>
                {overLimit && <span className="rounded bg-amber-bg px-2 py-0.5 text-sm text-amber">Over the credit limit</span>}
              </div>
            )}
          </div>
        </div>

        <div className="card min-w-64 space-y-2 p-3 text-right">
          <p className="text-xs text-muted">Total bill</p>
          <p className="text-4xl font-bold leading-none text-green">{rs(total)}</p>
          {!counter && cust && !walkIn && <p className="text-sm text-muted">Receivable after: <b className={balanceAfter > 0 ? "text-red" : "text-ink"}>{rs(balanceAfter)}</b></p>}
          {counter && <p className="text-sm text-muted">{received > 0 ? "Paid in full at the counter" : ""}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button className="btn" tabIndex={-1} onClick={() => { if (!filled.length || confirm("Discard this invoice?")) router.push("/sales"); }}>Cancel</button>
            {counter && <button className="btn" tabIndex={-1} disabled={!canSave} onClick={() => save("hold")}>{busy === "hold" ? <><Spinner /> Holding…</> : <>Hold <Key k="F8" /></>}</button>}
            <button ref={reg("save")} className="btn btn-primary" disabled={counter ? !canPay : !canSave} onClick={() => save("save")}>{busy === "save" ? <><Spinner /> Saving…</> : <>{counter ? "Pay & complete" : "Save"} <Key k="F10" /></>}</button>
          </div>
          <button className="text-sm text-accent underline" tabIndex={-1} disabled={counter ? !canPay : !canSave} onClick={() => save("print")}>{busy === "print" ? "Saving…" : "Save and print"} <Key k="⇧F10" /></button>
          {problem && !busy && <p className="text-xs text-muted">{problem}</p>}
        </div>
      </section>

      {/* key legend */}
      <p data-noprint className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span><Key k="Enter" /> next</span><span><Key k="F2" /> counter / ledger</span><span><Key k="F3" /> customer</span><span><Key k="F4" /> {counter ? "payment method" : "cash / credit"}</span>
        <span><Key k="F7" /> buy from market</span><span><Key k="F9" /> list</span><span><Key k="↑↓" /> rows</span><span><Key k="⇧F6" /> delete row</span><span><Key k="Backspace" /> change part</span><span><Key k="F10" /> save</span>
      </p>

      {modal === "cust" && <CustomerPicker allowAdd onPick={(c) => { setModal(""); chooseCustomer(c); }} onClose={() => { setModal(""); focus("cust"); }} />}
      {modal === "prod" && <ProductPicker onAdd={(p) => { setModal(""); const t = rows.find((x) => x.key === pickRow && !x.p) ?? rows.find((x) => !x.p); if (t) setProduct(t.key, p); }}
        inInvoice={Object.fromEntries(filled.map(({ r, c }) => [r.p!.id, c.q]))} onClose={() => { setModal(""); focus("prod:" + (pickRow || rows[rows.length - 1].key)); }} />}
      {modal === "market" && <MarketModal canCreate={can("stock.manage")} onClose={() => { setModal(""); focus("prod:" + rows[rows.length - 1].key); }}
        onAdd={(m) => { setModal(""); const t = rows.find((x) => !x.p) ?? rows[rows.length - 1]; setProduct(t.key, m.p, { q: String(m.qty), price: String(m.price), market: { cost: m.cost, vendor: m.vendor } }); }} />}
    </div>
  );
}

/** Product cell: type to search, arrows and Enter to choose. A chosen part is shown as text; Backspace changes it. */
function ProductCell({ row, reg, onPick, onClear, onEmptyEnter, onArrow }: {
  row: Row; reg: (id: string) => (el: HTMLElement | null) => void; onPick: (p: Prod) => void; onClear: () => void; onEmptyEnter: () => void; onArrow: (d: number) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [wait, setWait] = useState(false);
  const { items, ready } = useSearch<Prod>("/api/inventory/products", q.trim(), !row.p && q.trim().length > 0);
  useEffect(() => { setAt(0); }, [items]);
  const choose = useCallback((p: Prod) => { setQ(""); setOpen(false); setWait(false); onPick(p); }, [onPick]);
  useEffect(() => { if (wait && ready && items.length) choose(items[Math.min(at, items.length - 1)]); else if (wait && ready) setWait(false); }, [wait, ready, items, at, choose]);

  if (row.p) {
    return (
      <input ref={reg("prod:" + row.key)} data-row={row.key} data-cell="prod" readOnly aria-label="Product" title="Backspace to change the part"
        className="h-9 w-full rounded border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none focus:border-accent focus:ring-2 focus:ring-accent" value={row.p.name_en + (row.p.name_ur ? "  ·  " + row.p.name_ur : "")}
        onKeyDown={(e) => { if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); onClear(); } else if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLElement>('[data-row="' + row.key + '"][data-cell="qty"]')?.focus(); } else if (e.key === "ArrowUp") { e.preventDefault(); onArrow(-1); } else if (e.key === "ArrowDown") { e.preventDefault(); onArrow(1); } }} />
    );
  }
  return (
    <>
      <input ref={reg("prod:" + row.key)} data-row={row.key} data-cell="prod" role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list" aria-label="Search product" placeholder="Search part by name, code or Urdu…" autoComplete="off"
        className="h-9 w-full rounded border border-transparent bg-transparent px-1.5 text-sm outline-none placeholder:text-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setWait(false); }} onBlur={() => setTimeout(() => setOpen(false), 120)} onFocus={() => q && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!q.trim()) return onEmptyEnter();
            if (ready && items.length) choose(items[Math.min(at, items.length - 1)]); else setWait(true);
          } else if (e.key === "ArrowDown") { e.preventDefault(); if (open && items.length) setAt((a) => Math.min(a + 1, items.length - 1)); else onArrow(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); if (open && items.length) setAt((a) => Math.max(a - 1, 0)); else onArrow(-1); }
          else if (e.key === "Escape") { setOpen(false); }
        }} />
      {open && q.trim() && (
        <ul role="listbox" className="absolute left-1 top-full z-40 mt-1 max-h-80 w-[min(46rem,calc(100vw-4rem))] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {!ready && <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted"><Spinner /> Searching…</li>}
          {ready && !items.length && <li className="px-3 py-2 text-sm text-muted">No part matches “{q}”.</li>}
          {items.map((p, k) => (
            <li key={p.id} role="option" aria-selected={k === at} onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setAt(k)}
              className={"flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm " + (k === at ? "bg-accent text-accent-ink" : "")}>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name_en}{p.name_ur ? "  ·  " + p.name_ur : ""}</span>
              <span className={"w-24 shrink-0 truncate text-xs " + (k === at ? "" : "text-muted")}>{p.code_name ?? ""}</span>
              <span className={"w-20 shrink-0 text-right text-xs " + (k === at ? "" : p.on_hand <= 0 ? "text-red" : "text-muted")}>stock {fmtQty(p.on_hand)}</span>
              <span className="w-20 shrink-0 text-right font-semibold">{rs(p.cp)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Customer cell: type to search, arrows and Enter to choose, Enter on an unchanged customer goes on to the items. */
function CustomerBox({ cust, kind, reg, onPick, onEmptyEnter }: { cust: Cust | null; kind: "counter" | "ledger"; reg: (id: string) => (el: HTMLElement | null) => void; onPick: (c: PickedCustomer) => void; onEmptyEnter: () => void }) {
  const [q, setQ] = useState<string | null>(null);   // null: show the chosen customer
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [wait, setWait] = useState(false);
  const typed = (q ?? "").trim();
  const { items, ready } = useSearch<CustHit>("/api/customers", typed, typed.length > 0);
  useEffect(() => { setAt(0); }, [items]);
  const choose = useCallback((c: CustHit) => { setQ(null); setOpen(false); setWait(false); onPick({ id: c.id, name: c.name }); }, [onPick]);
  useEffect(() => { if (wait && ready && items.length) choose(items[Math.min(at, items.length - 1)]); else if (wait && ready) setWait(false); }, [wait, ready, items, at, choose]);
  const shown = q ?? (cust ? (cust.is_walk_in ? "Walk-in customer" : cust.name) : "");

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="g-cust">Customer <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">F3</kbd></label>
      <input id="g-cust" ref={reg("cust")} data-cell="cust" role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list" autoComplete="off" className="input text-lg font-semibold" value={shown}
        placeholder={kind === "ledger" ? "Type a name, phone or code, then Enter" : "Walk-in. Type to pick a registered customer"}
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setQ(e.target.value); setOpen(true); setWait(false); }}
        onBlur={() => setTimeout(() => { setOpen(false); setQ(null); }, 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!typed) { if (cust && (kind === "counter" || !cust.is_walk_in)) onEmptyEnter(); return; }
            if (ready && items.length) choose(items[Math.min(at, items.length - 1)]); else setWait(true);
          } else if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, Math.max(items.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Escape") { setQ(null); setOpen(false); }
        }} />
      {open && typed && (
        <ul role="listbox" className="absolute left-0 top-full z-40 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {!ready && <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted"><Spinner /> Searching…</li>}
          {ready && !items.length && <li className="px-3 py-2 text-sm text-muted">No customer matches “{typed}”. Press F9 to add one.</li>}
          {items.map((c, k) => (
            <li key={c.id} role="option" aria-selected={k === at} onMouseDown={(e) => { e.preventDefault(); choose(c); }} onMouseEnter={() => setAt(k)}
              className={"flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm " + (k === at ? "bg-accent text-accent-ink" : "")}>
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <span className={"w-28 shrink-0 truncate text-xs " + (k === at ? "" : "text-muted")}>{c.route?.name ?? c.code}</span>
              <span className={"w-24 shrink-0 text-right text-xs " + (k === at ? "" : c.balance > 0 ? "text-red" : "text-muted")}>{c.balance ? rs(c.balance) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
