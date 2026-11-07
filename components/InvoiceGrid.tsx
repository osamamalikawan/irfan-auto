"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withArea } from "@/lib/cust";
import { qty as fmtQty, rs } from "@/lib/format";
import { cpRpText, defaultPriceType, priceFor, PRICE_LABEL, type PriceType } from "@/lib/price";
import CreditSummary from "./CreditSummary";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import { MarketModal, ProductPicker, type Prod } from "./InvoiceBuilder";
import MarketDetailsModal, { type MarketInfo } from "./MarketDetailsModal";
import { Spinner } from "./Loading";
import { useMe } from "./Me";
import PaySplit, { newRow, paysTotal, toPayments, usePaymentMethods, type PayRow } from "./PaySplit";

/*
 * Keyboard-first invoice screen for the desktop (the phone keeps the touch form).
 *  customer: type, Enter  ->  product: type, Enter  ->  quantity, Enter  ->  price, Enter  ->  next row.
 *  F2 counter/ledger   F8 RP/CP price   F3 customer   F4 payment (counter) or cash/credit (ledger)   F7 buy from market
 *  F9 list   F10 save (Shift+F10 save and print)   Shift+F6 delete row   Up/Down rows
 */

type Row = { key: string; p?: Prod; q: string; price: string; disc: string; market?: MarketInfo };
type Hist = { days_ago: number; price: number; qty: number };
type Cust = { id: string; name: string; area: string | null; is_walk_in: boolean; credit_limit: number; balance: number; route: string | null };
type CustHit = { id: string; code: string; name: string; owner: string | null; phone: string | null; balance: number; route: { name: string } | null; area?: { name: string } | null };

const blank = (): Row => ({ key: crypto.randomUUID(), q: "", price: "", disc: "" });
const money = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const freeFor = (p: Prod, q: number) => {
  const m = /^(\d+)\+(\d+)$/.exec(p.scheme ?? "");
  return m && +m[1] > 0 && +m[2] > 0 ? Math.floor(q / +m[1]) * +m[2] : 0;
};

/** Search as you type. Results count only when they belong to the text now in the box. */
function useSearch<T>(path: string, q: string, enabled: boolean, limit = 8) {
  const [state, setState] = useState<{ q: string; items: T[]; total: number }>({ q: "\u0000", items: [], total: 0 });
  const req = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      const id = ++req.current;
      try {
        const r = await fetch(path + "?limit=" + limit + "&q=" + encodeURIComponent(q));
        const j = await r.json();
        if (id === req.current && r.ok) setState({ q, items: j.items ?? [], total: Number(j.total ?? (j.items ?? []).length) });
      } catch { /* the next keystroke retries */ }
    }, 120);
    return () => clearTimeout(t);
  }, [path, q, enabled, limit]);
  return { items: state.q === q ? state.items : [], ready: state.q === q, total: state.q === q ? state.total : 0 };
}

/** Urdu name for the list: the text in brackets is left out. */
const plainUrdu = (s: string | null) => (s ?? "").replace(/\s*[(（][^)）]*[)）]/g, "").trim();
const ago = (n: number) => (n <= 0 ? "Today" : n === 1 ? "Yesterday" : n + " days ago");

const Key = ({ k }: { k: string }) => <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">{k}</kbd>;

export default function InvoiceGrid({ customerId, editId }: { customerId?: string; editId?: string }) {
  const router = useRouter();
  const { can } = useMe();
  const canDiscount = can("sales.discount");
  const { methods } = usePaymentMethods();

  const editing = !!editId;
  const [edit, setEdit] = useState<{ no: string; oldTotal: number; paid: number; fulfil: string } | null>(null);
  const [kind, setKind] = useState<"counter" | "ledger">(customerId || editId ? "ledger" : "counter");
  const [term, setTerm] = useState<"credit" | "cash">("credit");
  const [priceType, setPriceType] = useState<PriceType>(defaultPriceType(customerId || editId ? "ledger" : "counter"));
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
  const [modal, setModal] = useState<"" | "cust" | "prod" | "market" | "mkdetails">("");
  const [mkRow, setMkRow] = useState("");
  const mkAfter = useRef<"price" | "next">("price");
  const [hist, setHist] = useState<Record<string, Hist | null>>({});
  const histAsked = useRef<Record<string, Set<string>>>({});
  const [pickRow, setPickRow] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "print">("");
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
    setCust({ id: x.id, name: x.name, area: x.area?.name ?? null, is_walk_in: !!x.is_walk_in, credit_limit: Number(x.credit_limit), balance: Number(x.balance), route: x.route?.name ?? null });
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
    if (editId) {
      fetch("/api/sales/" + editId + "/edit-data").then(async (r) => ({ ok: r.ok, j: await r.json() })).then(async ({ ok, j }) => {
        if (!ok) return setError(j.error || "Could not open this order for editing");
        const sale = j.sale;
        setKind(sale.sale_kind === "counter" ? "counter" : "ledger"); setTerm(sale.pay_term === "cash" ? "cash" : "credit");
        setEdit({ no: sale.no, oldTotal: Number(sale.total), paid: Number(sale.paid), fulfil: sale.fulfil_status });
        setDiscount(Number(sale.discount) > 0 ? String(Number(sale.discount)) : ""); setLocal(Number(sale.local_charges) > 0 ? String(Number(sale.local_charges)) : "");
        setBilti(Number(sale.bilti) > 0 ? String(Number(sale.bilti)) : ""); setRemarks(sale.remarks ?? "");
        const loaded: Row[] = j.lines.map((l: { key: string; qty: number; price: number; disc_pct: number; market: MarketInfo | null; product: Prod }) => ({
          key: l.key, p: l.product, q: String(l.qty), price: String(l.price), disc: String(l.disc_pct), market: l.market ?? undefined,
        }));
        const blankRow = blank();
        setRows([...loaded, blankRow]);
        await chooseCustomer({ id: sale.customer_id, name: sale.customer_name }, false);
        focus("prod:" + blankRow.key);
      }).catch(() => setError("Could not open this order for editing"));
    } else if (customerId) chooseCustomer({ id: customerId, name: "" }); else { useWalkIn(); focus("cust"); }
  }, [customerId, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickKind(k: "counter" | "ledger") {
    if (editing || k === kind) return;
    setKind(k); setPriceType(defaultPriceType(k)); setError(""); setSplit(false); setRecv("");
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
  const nextRowProduct = (from: Row) => { const t = rows[idx(from.key) + 1]; if (t) focus(rowCell(t, "prod")); else focus(flow[0]); };
  const afterPrice = (r: Row) => { if (r.p?.market_list && !r.market) { mkAfter.current = "next"; setMkRow(r.key); setModal("mkdetails"); } else nextRowProduct(r); };

  useEffect(() => {
    const ids = rows.filter((r) => r.p).map((r) => r.p!.id);
    if (!cust || !ids.length) return;
    fetch("/api/sales/discounts?customer=" + cust.id + "&ids=" + ids.join(",")).then((r) => r.json()).then((j) => j.pct && setDefPct(j.pct)).catch(() => {});
  }, [cust, rows.filter((r) => r.p).length]); // eslint-disable-line react-hooks/exhaustive-deps

  // when each part was last sold to this customer, and at what price
  useEffect(() => {
    if (!cust || cust.is_walk_in) return;
    const asked = (histAsked.current[cust.id] ??= new Set<string>());
    const ids = [...new Set(rows.filter((r) => r.p && !asked.has(r.p.id)).map((r) => r.p!.id))];
    if (!ids.length) return;
    ids.forEach((i) => asked.add(i));
    fetch("/api/sales/history?customer=" + cust.id + "&ids=" + ids.join(",")).then((r) => r.json()).then((j) => {
      if (!j.history) return;
      setHist((h) => { const n = { ...h }; for (const id of ids) n[cust.id + ":" + id] = j.history[id] ?? null; return n; });
    }).catch(() => ids.forEach((i) => asked.delete(i)));
  }, [cust, rows]);

  /* ---------- numbers ---------- */
  const calc = rows.map((r) => {
    if (!r.p) return null;
    const q = money(r.q), price = r.price !== "" ? money(r.price) : priceFor(r.p, priceType), pct = r.disc !== "" ? money(r.disc) : defPct[r.p.id] ?? 0;
    const free = freeFor(r.p, q), ld = Math.round((q * price * pct) / 100);
    return { q, price, pct, free, ld, value: q * price - ld, tot: q + free, after: r.market || r.p.market_list ? null : r.p.on_hand - (q + free) };
  });
  const filled = rows.map((r, i) => ({ r, c: calc[i] })).filter((x): x is { r: Row; c: NonNullable<(typeof calc)[number]> } => !!x.c);
  const gross = filled.reduce((s, x) => s + x.c.q * x.c.price, 0), ldisc = filled.reduce((s, x) => s + x.c.ld, 0);
  const totQty = filled.reduce((s, x) => s + x.c.q, 0), freeQty = filled.reduce((s, x) => s + x.c.free, 0);
  // discount by price list: the percent every (non-market) item of that list gets
  const listGroups = (() => {
    const m = new Map<string, number[]>();
    for (const { r, c } of filled) { const n = r.p!.list_name; if (n && !r.market && !r.p!.market_list) m.set(n, [...(m.get(n) ?? []), c.pct]); }
    return [...m].map(([name, p]) => ({ name, count: p.length, shared: p.every((x) => x === p[0]) ? p[0] : null }));
  })();
  const setListDisc = (name: string, v: string) => {
    const clean = v.replace(/[^\d.]/g, "");
    setRows((rs) => rs.map((r) => (r.p?.list_name === name && !r.market && !r.p.market_list ? { ...r, disc: clean } : r)));
  };
  const total = gross - ldisc - money(discount) + Math.round(money(bilti)) + Math.round(money(local));

  const counter = kind === "counter";
  const walkIn = !!cust?.is_walk_in;
  const counterPays = toPayments(pay, split, total);
  const counterOk = split ? Math.abs(paysTotal(pay) - total) < 0.005 && counterPays.length > 0 : counterPays.length > 0;
  const received = counter ? total : Math.min(money(recv), total);
  const balanceAfter = cust && !walkIn ? (edit ? cust.balance + total - edit.oldTotal : cust.balance + total - (counter ? total : Math.min(money(recv), total))) : 0;
  // credit limit: highlighted as soon as this invoice would take the customer over it
  const overBy = cust && !walkIn && !counter && cust.credit_limit > 0 && balanceAfter > cust.credit_limit ? balanceAfter - cust.credit_limit : 0;
  const overBlocked = overBy > 0 && (!edit || total > edit.oldTotal);
  const problem = !cust ? "Choose a customer" : !filled.length ? "Add at least one item" : filled.some((x) => x.c.q <= 0) ? "Enter a quantity for every item" : filled.some((x) => x.c.price <= 0) ? "An item has no price" : !counter && walkIn ? "Choose a customer for a ledger sale" : filled.find((x) => x.r.p!.market_list && !x.r.market) ? "Enter the market details for " + filled.find((x) => x.r.p!.market_list && !x.r.market)!.r.p!.name_en : "";
  const canSave = !problem && !busy && total >= 0;
  const canPay = canSave && total > 0 && counterOk;

  async function save(mode: "save" | "print") {
    if (!cust || busy) return;
    if (!editing && counter && !canPay) return setError(problem || "Pay the full amount to complete the sale");
    if (problem) return setError(problem);
    setBusy(mode); setError("");
    const body = {
      customer_id: cust.id, kind, term, hold: false, idem_key: idem, discount: money(discount), bilti: money(bilti), local_charges: money(local), remarks,
      contact_name: walkIn ? contactName : "", contact_phone: walkIn ? contactPhone : "",
      payments: counter ? counterPays : money(recv) > 0 && recvMethod ? [{ method_id: recvMethod, amount: Math.min(money(recv), total) }] : [],
      lines: filled.map(({ r }) => ({ product_id: r.p!.id, qty: money(r.q), price: r.price !== "" ? money(r.price) : undefined, price_type: priceType, disc_pct: r.disc !== "" ? money(r.disc) : undefined, market: r.market })),
    };
    const res = editing
      ? await fetch("/api/sales/" + editId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: body.lines, discount: body.discount, bilti: body.bilti, local_charges: body.local_charges, remarks, term }) })
      : await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(j.error || "Could not save the invoice");
    router.replace("/sales/" + (editing ? editId : j.id) + (mode === "print" ? "?print=1" : ""));
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
    else if (e.key === "F8") run(() => setPriceType((t) => (t === "rp" ? "cp" : "rp")));
    else if (e.key === "F4") run(() => {
      if (counter) {
        if (!methods.length) return;
        const cur = pay[0]?.method_id; const i = methods.findIndex((m) => m.id === cur);
        setSplit(false); setPay([{ ...(pay[0] ?? newRow(methods[0].id)), method_id: methods[(i + 1) % methods.length].id, amount: "" }]);
      } else setTerm(term === "cash" ? "credit" : "cash");
    });
    else if (e.key === "F7") run(() => {
      const mr = rowKey ? rows.find((x) => x.key === rowKey) : undefined;
      if (mr?.p?.market_list) { mkAfter.current = "price"; setMkRow(mr.key); setModal("mkdetails"); } else setModal("market");
    });
    else if (e.key === "F9") run(() => { if (el?.dataset?.cell === "cust") setModal("cust"); else { setPickRow(rowKey ?? rows.find((r) => !r.p)?.key ?? ""); setModal("prod"); } });
    else if (e.key === "F10") run(() => save(e.shiftKey ? "print" : "save"));
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") run(() => save("save"));
    else if (e.key === "F6" && e.shiftKey) run(() => { if (rowKey && rows.find((r) => r.key === rowKey)?.p) removeRow(rowKey); });
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  /* ---------- footer: Enter walks down the fields, then lands on Save ---------- */
  const flow = [...(canDiscount ? listGroups.map((_, i) => "ld:" + i) : []), canDiscount ? "disc" : "", "local", "bilti", "remarks", editing || counter ? "" : "recv", "save"].filter(Boolean);
  const nextField = (cur: string) => focus(flow[flow.indexOf(cur) + 1] ?? "save");
  const enterTo = (cur: string) => (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); nextField(cur); } };

  const th = "inv-th border-b border-[var(--g-line)] px-1.5 py-2 text-left text-[12px] font-semibold first:rounded-tl-2xl last:rounded-tr-2xl";
  const cell = "h-9 w-full rounded border border-transparent bg-transparent px-1.5 text-sm outline-none focus:border-green focus:bg-surface focus:ring-2 focus:ring-green";

  return (
    <div className="inv-page flex min-h-[calc(100dvh-7rem)] flex-col gap-3 p-4">
      {editing && (
        <section className="inv-card flex flex-wrap items-center gap-3 px-4 py-2.5">
          <b className="text-[color:var(--g-ink)]">Editing {edit?.no ?? "…"}</b>
          {edit && <span className="pill bg-amber-bg text-amber">{edit.fulfil === "packed" ? "Packed" : "Active"}</span>}
          <span className="text-sm text-muted">Stock and the customer&apos;s account are corrected when you save. Received so far: <b className="text-ink">{rs(edit?.paid ?? 0)}</b></span>
        </section>
      )}

      {/* top strip */}
      <section className={"inv-card grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-2 p-4 " + (overBy > 0 ? "!border-red ring-2 ring-red" : "")}>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Sale <Key k="F2" /></span>
          <div role="radiogroup" aria-label="Sale type" className="flex gap-1">
            {([["counter", "Counter"], ["ledger", "Ledger"]] as const).map(([k, l]) => (
              <button key={k} type="button" tabIndex={-1} role="radio" aria-checked={kind === k} onClick={() => pickKind(k)} disabled={editing} className={"chip " + (kind === k ? "chip-on" : "") + (editing ? " opacity-60" : "")}>{l}</button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Price type" title="Price list for new items. RP is used when a part has no CP, and the other way round.">
            {(["rp", "cp"] as const).map((t) => <button key={t} type="button" tabIndex={-1} role="radio" aria-checked={priceType === t} onClick={() => setPriceType(t)} className={"chip " + (priceType === t ? "chip-on" : "")}>{PRICE_LABEL[t]}</button>)}
            <Key k="F8" />
          </div>
          {!counter && (
            <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Cash or credit">
              {([["credit", "Credit"], ["cash", "Cash"]] as const).map(([k, l]) => <button key={k} type="button" tabIndex={-1} role="radio" aria-checked={term === k} onClick={() => setTerm(k)} className={"chip " + (term === k ? "chip-on" : "")}>{l}</button>)}
              <Key k="F4" />
            </div>
          )}
        </div>

        <CustomerBox cust={cust} kind={kind} locked={editing} reg={reg} onPick={(c) => chooseCustomer(c)} onEmptyEnter={() => focus("prod:0")} />

        <div className="min-w-56">
          {cust && !walkIn ? <CreditSummary limit={cust.credit_limit} balance={cust.balance} align="right" /> : <p className="text-right text-sm text-muted">Previous Balance: —</p>}
        </div>

        {walkIn && !editing && (
          <div className="col-span-3 grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="g-cname">Customer name (optional, printed on this invoice only)</label><input id="g-cname" className="input" maxLength={80} value={contactName} onChange={(e) => setContactName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("g-cphone")?.focus(); } }} /></div>
            <div><label className="label" htmlFor="g-cphone">Phone (optional)</label><input id="g-cphone" className="input" type="tel" maxLength={30} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focus("prod:0"); } }} /></div>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      {overBy > 0 && cust && (
        <p role="alert" className="rounded-xl border-2 border-red bg-red-bg px-4 py-2 text-sm font-semibold text-red">
          ⚠ Credit limit exceeded by {rs(overBy)}. Limit {rs(cust.credit_limit)}, balance after this invoice {rs(balanceAfter)}.
          {overBlocked ? " It cannot be saved like this: reduce the bill or receive cash now." : " (The balance was already over the limit before this change.)"}
        </p>
      )}

      {/* items grid */}
      <section className="inv-card p-0">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup><col style={{ width: "2rem" }} /><col /><col style={{ width: "4.6rem" }} /><col style={{ width: "5.6rem" }} /><col style={{ width: "4.4rem" }} /><col style={{ width: "6rem" }} /><col style={{ width: "3.2rem" }} /><col style={{ width: "3.6rem" }} /><col style={{ width: "7.5rem" }} /><col style={{ width: "9.6rem" }} /><col className="hidden 2xl:table-column" style={{ width: "6rem" }} /></colgroup>
          <thead>
            <tr><th className={th}>#</th><th className={th}>Product</th><th className={th + " text-right"}>Qty</th><th className={th + " text-right"}>Price</th><th className={th + " text-right"}>Disc %</th><th className={th + " text-right"}>Value</th><th className={th + " text-right"}>Free</th><th className={th + " text-right"}>Total</th><th className={th + " text-right"}>Stock</th><th className={th}>History</th><th className={th + " hidden 2xl:table-cell"}>Rack</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = calc[i];
              const hv = r.p && cust && !walkIn ? hist[cust.id + ":" + r.p.id] : undefined;
              return (
                <tr key={r.key} className={"align-middle focus-within:bg-[var(--g-row)] " + (r.p?.market_list || r.market ? "bg-amber-bg" : "")}>
                  <td className="border-b border-[var(--g-line)] px-1.5 text-center text-xs text-muted">{r.p ? i + 1 : ""}</td>
                  <td className="relative border-b border-[var(--g-line)] px-1 py-0.5">
                    <ProductCell row={r} reg={reg} onPick={(p) => setProduct(r.key, p)} onClear={() => patch(r.key, { p: undefined, market: undefined })}
                      onEmptyEnter={() => (filled.length ? focus(flow[0]) : undefined)} onArrow={(d) => goRow(r, d, "prod")} />
                  </td>
                  <td className="border-b border-[var(--g-line)] px-1 py-0.5"><input ref={reg("qty:" + r.key)} data-row={r.key} data-cell="qty" disabled={!r.p} className={cell + " text-right"} inputMode="decimal" aria-label={"Quantity, row " + (i + 1)} value={r.q} onChange={(e) => patch(r.key, { q: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (money(r.q) > 0) focus("price:" + r.key); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "qty"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "qty"); } else if (e.key === "Backspace" && r.q === "") { e.preventDefault(); focus("prod:" + r.key); } }} /></td>
                  <td className="border-b border-[var(--g-line)] px-1 py-0.5"><input ref={reg("price:" + r.key)} data-row={r.key} data-cell="price" disabled={!r.p} readOnly={!canDiscount} className={cell + " text-right"} inputMode="decimal" aria-label={"Price, row " + (i + 1)} value={r.price !== "" ? r.price : r.p ? String(priceFor(r.p, priceType)) : ""} onChange={(e) => patch(r.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); afterPrice(r); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "price"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "price"); } }} /></td>
                  <td className="border-b border-[var(--g-line)] px-1 py-0.5"><input ref={reg("disc:" + r.key)} data-row={r.key} data-cell="disc" disabled={!r.p} readOnly={!canDiscount || !!r.market || !!r.p?.market_list} className={cell + " text-right"} inputMode="decimal" aria-label={"Discount percent, row " + (i + 1)} value={r.disc !== "" ? r.disc : c && c.pct ? String(c.pct) : ""} onChange={(e) => patch(r.key, { disc: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextRowProduct(r); } else if (e.key === "ArrowUp") { e.preventDefault(); goRow(r, -1, "disc"); } else if (e.key === "ArrowDown") { e.preventDefault(); goRow(r, 1, "disc"); } }} /></td>
                  <td className="border-b border-[var(--g-line)] px-2 text-right text-sm font-semibold">{c ? rs(c.value) : ""}</td>
                  <td className="border-b border-[var(--g-line)] px-2 text-right text-sm text-green">{c && c.free > 0 ? "+" + c.free : ""}</td>
                  <td className="border-b border-[var(--g-line)] px-2 text-right text-sm">{c && c.q > 0 ? fmtQty(c.tot) : ""}</td>
                  <td className="border-b border-[var(--g-line)] px-2 text-right text-sm">{c && r.p ? (c.after === null ? <span className="text-muted">market</span> : <><span className="text-muted">{fmtQty(r.p.on_hand)}</span> → <b className={c.after < 0 ? "text-red" : ""}>{fmtQty(c.after)}</b></>) : ""}</td>
                  <td className="border-b border-[var(--g-line)] px-2 py-1 text-[12px] leading-tight">
                    {r.p && walkIn && <span className="text-muted">—</span>}
                    {r.p && cust && !walkIn && (hv === undefined ? <span className="text-muted">…</span> : hv === null ? <span className="font-bold text-red">Never Sold Before</span> : <><span className="font-semibold">{ago(hv.days_ago)}</span><br /><span className="text-muted">@ {rs(hv.price)} × {fmtQty(hv.qty)}</span></>)}
                    {(r.p?.market_list || r.market) && (
                      <button type="button" tabIndex={-1} className="mt-0.5 block max-w-full truncate rounded-md border border-amber bg-amber-bg px-1.5 py-0.5 text-left text-[11px] font-bold text-amber"
                        onClick={() => { mkAfter.current = "price"; setMkRow(r.key); setModal("mkdetails"); }}>
                        {r.market ? "Cost " + rs(r.market.cost) + (r.market.vendor ? " · " + r.market.vendor : "") + " ✎" : "Market details (F7)"}
                      </button>
                    )}
                  </td>
                  <td className="hidden truncate border-b border-[var(--g-line)] px-1.5 text-xs text-muted 2xl:table-cell" title={r.p?.racks.join(", ")}>{r.p?.racks.join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {canDiscount && listGroups.length > 0 && (
        <section className="inv-card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <span className="text-sm font-bold text-[color:var(--g-ink)]">Discount by list</span>
          {listGroups.map((g, i) => (
            <label key={g.name} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{g.name}</span><span className="text-xs text-muted">({g.count})</span>
              <input ref={reg("ld:" + i)} className="input h-9 w-20 text-right" inputMode="decimal" aria-label={"Discount percent for list " + g.name} placeholder="mixed" value={g.shared === null ? "" : String(g.shared)}
                onChange={(e) => setListDisc(g.name, e.target.value)} onKeyDown={enterTo("ld:" + i)} />
              <span className="text-muted">%</span>
            </label>
          ))}
          <span className="ml-auto text-xs text-muted">Sets the discount on every item of that list. One item can still be changed in its own row.</span>
        </section>
      )}

      {/* totals and payment */}
      <section className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
        <div className="inv-card grid grid-cols-3 gap-3 p-3 text-center">
          {[["Total qty", fmtQty(totQty)], ["Free qty", fmtQty(freeQty)], ["Items", String(filled.length)]].map(([l, v]) => <div key={l} className="inv-stat px-4 py-2"><p className="text-xs opacity-75">{l}</p><p className="text-2xl font-bold">{v}</p></div>)}
        </div>

        <div className="inv-card grid grid-cols-4 gap-3 p-4">
          {canDiscount && <div><label className="label" htmlFor="g-disc">Discount (Rs)</label>
            <input id="g-disc" ref={reg("disc")} className="input text-right font-semibold" inputMode="decimal" value={ldisc + money(discount) > 0 ? String(ldisc + money(discount)) : ""} placeholder="0"
              onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); setDiscount(t === "" ? "" : String(Math.max(0, Number(t) - ldisc))); }} onKeyDown={enterTo("disc")} />
            {ldisc > 0 && <p className="mt-0.5 text-[11px] text-muted">Items {rs(ldisc)}{money(discount) > 0 ? " + extra " + rs(money(discount)) : ""}</p>}</div>}
          <div><label className="label" htmlFor="g-local">Local charges</label><input id="g-local" ref={reg("local")} className="input text-right" inputMode="numeric" placeholder="inside city" value={local} onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={enterTo("local")} /></div>
          <div><label className="label" htmlFor="g-bilti">Bilti</label><input id="g-bilti" ref={reg("bilti")} className="input text-right" inputMode="numeric" placeholder="outside city" value={bilti} onChange={(e) => setBilti(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={enterTo("bilti")} /></div>
          <div className={canDiscount ? "" : "col-span-2"}><label className="label" htmlFor="g-rem">Remarks</label><input id="g-rem" ref={reg("remarks")} className="input" maxLength={500} placeholder="BY HAND" value={remarks} onChange={(e) => setRemarks(e.target.value)} onKeyDown={enterTo("remarks")} /></div>

          <div className="col-span-4 border-t border-line pt-3">
            {editing ? (
              <p className="text-sm text-muted">Received so far <b className="text-ink">{rs(edit?.paid ?? 0)}</b>. {term === "cash" ? "The rest is collected on delivery." : "The rest stays on the customer's account."} Payments are recorded from the invoice page.</p>
            ) : counter ? (
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
              </div>
            )}
          </div>
        </div>

        <div className={"inv-total min-w-64 space-y-2 p-4 text-right " + (overBy > 0 ? "inv-total-over" : "")}>
          <p className="text-xs uppercase tracking-wide opacity-80">Total bill</p>
          <p className="text-4xl font-bold leading-none">{rs(total)}</p>
          {!counter && cust && !walkIn && <p className="text-sm opacity-90">Receivable after: <b>{rs(balanceAfter)}</b>{overBy > 0 && <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs font-bold text-red">over limit</span>}</p>}
          {counter && <p className="text-sm opacity-90">{received > 0 ? "Paid in full at the counter" : ""}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button className="btn" tabIndex={-1} onClick={() => { if (editing) router.push("/sales/" + editId); else if (!filled.length || confirm("Discard this invoice?")) router.push("/sales"); }}>Cancel</button>
            <button ref={reg("save")} className="btn btn-primary" disabled={editing ? !canSave : counter ? !canPay : !canSave} onClick={() => save("save")}>{busy === "save" ? <><Spinner /> Saving…</> : <>{editing ? "Save changes" : counter ? "Pay & complete" : "Save"} <Key k="F10" /></>}</button>
          </div>
          <button className="text-sm text-white underline" tabIndex={-1} disabled={editing ? !canSave : counter ? !canPay : !canSave} onClick={() => save("print")}>{busy === "print" ? "Saving…" : "Save and print"} <Key k="⇧F10" /></button>
          {problem && !busy && <p className="text-xs opacity-90">{problem}</p>}
        </div>
      </section>

      {/* key legend */}
      <p data-noprint className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span><Key k="Enter" /> next</span><span><Key k="F2" /> counter / ledger</span><span><Key k="F3" /> customer</span><span><Key k="F4" /> {counter ? "payment method" : "cash / credit"}</span>
        <span><Key k="F8" /> RP / CP</span><span><Key k="F7" /> buy from market</span><span><Key k="F9" /> list</span><span><Key k="↑↓" /> rows</span><span><Key k="⇧F6" /> delete row</span><span><Key k="Backspace" /> change part</span><span><Key k="F10" /> save</span>
      </p>

      {modal === "cust" && <CustomerPicker allowAdd onPick={(c) => { setModal(""); chooseCustomer(c); }} onClose={() => { setModal(""); focus("cust"); }} />}
      {modal === "prod" && <ProductPicker onAdd={(p) => { setModal(""); const t = rows.find((x) => x.key === pickRow && !x.p) ?? rows.find((x) => !x.p); if (t) setProduct(t.key, p); }}
        inInvoice={Object.fromEntries(filled.map(({ r, c }) => [r.p!.id, c.q]))} onClose={() => { setModal(""); focus("prod:" + (pickRow || rows[rows.length - 1].key)); }} />}
      {modal === "mkdetails" && (() => {
        const r = rows.find((x) => x.key === mkRow); const i = rows.findIndex((x) => x.key === mkRow); const c = i >= 0 ? calc[i] : null;
        if (!r?.p || !c) return null;
        const back = () => { setModal(""); focus("price:" + r.key); };
        return <MarketDetailsModal title={r.p.name_en} qty={c.q} price={c.price} initial={r.market} onClose={back}
          onSave={(m) => { patch(r.key, { market: m }); setModal(""); if (mkAfter.current === "next") nextRowProduct(r); else focus("price:" + r.key); }} />;
      })()}
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
  const { items, ready, total } = useSearch<Prod>("/api/inventory/products", q.trim(), !row.p && q.trim().length > 0, 40);
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
        <ul role="listbox" className="absolute left-1 top-full z-40 mt-1 max-h-96 w-[min(62rem,calc(100vw-4rem))] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {!ready && <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted"><Spinner /> Searching…</li>}
          {ready && !items.length && <li className="px-3 py-2 text-sm text-muted">No part matches “{q}”.</li>}
          {items.map((p, k) => {
            const on = k === at;
            const dim = on ? "opacity-80" : "text-muted";
            return (
              <li key={p.id} role="option" aria-selected={on} onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setAt(k)}
                className={"flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm " + (on ? "bg-accent text-accent-ink" : "")}>
                <span className="w-24 shrink-0 truncate font-semibold" title={p.code_name ?? ""}>{p.code_name ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name_en}{p.brand ? " (" + p.brand + ")" : ""}</span>
                <span className="w-32 shrink-0 truncate text-right" style={{ fontFamily: "var(--font-urdu), serif", direction: "rtl" }}>{plainUrdu(p.name_ur)}</span>
                <span className={"w-28 shrink-0 truncate text-xs " + dim} title={p.list_name ?? ""}>{p.list_name ?? ""}</span>
                <span className="flex w-20 shrink-0 justify-center">{p.scheme && <span className="rounded-full border border-amber bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber">{p.scheme}</span>}</span>
                <span className="w-40 shrink-0 text-right text-xs font-semibold">{cpRpText(p)}</span>
                <span className={"w-14 shrink-0 text-right text-[11px] " + (on ? "opacity-80" : p.on_hand <= 0 ? "text-red" : "text-muted")}>{p.market_list ? "market" : fmtQty(p.on_hand)}</span>
              </li>
            );
          })}
          {ready && total > items.length && <li className="px-3 py-1.5 text-center text-xs text-muted">Showing the first {items.length} of {total} matches. Keep typing to narrow it down.</li>}
        </ul>
      )}
    </>
  );
}

/** Customer cell: type to search, arrows and Enter to choose, Enter on an unchanged customer goes on to the items. */
function CustomerBox({ cust, kind, locked, reg, onPick, onEmptyEnter }: { cust: Cust | null; kind: "counter" | "ledger"; locked?: boolean; reg: (id: string) => (el: HTMLElement | null) => void; onPick: (c: PickedCustomer) => void; onEmptyEnter: () => void }) {
  const [q, setQ] = useState<string | null>(null);   // null: show the chosen customer
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [wait, setWait] = useState(false);
  const typed = (q ?? "").trim();
  const { items, ready } = useSearch<CustHit>("/api/customers", typed, typed.length > 0);
  useEffect(() => { setAt(0); }, [items]);
  const choose = useCallback((c: CustHit) => { setQ(null); setOpen(false); setWait(false); onPick({ id: c.id, name: withArea(c.name, c.area?.name) }); }, [onPick]);
  useEffect(() => { if (wait && ready && items.length) choose(items[Math.min(at, items.length - 1)]); else if (wait && ready) setWait(false); }, [wait, ready, items, at, choose]);
  const shown = q ?? (cust ? (cust.is_walk_in ? "Walk-in customer" : withArea(cust.name, cust.area)) : "");

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="g-cust">Customer <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">F3</kbd></label>
      <input id="g-cust" ref={reg("cust")} data-cell="cust" role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list" autoComplete="off" readOnly={locked} className={"input text-lg font-semibold " + (locked ? "bg-bg" : "")} value={shown}
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
              <span className="min-w-0 flex-1 truncate font-medium">{withArea(c.name, c.area?.name)}</span>
              <span className={"w-28 shrink-0 truncate text-xs " + (k === at ? "" : "text-muted")}>{c.route?.name ?? c.code}</span>
              <span className={"w-24 shrink-0 text-right text-xs " + (k === at ? "" : c.balance > 0 ? "text-red" : "text-muted")}>{c.balance ? rs(c.balance) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
