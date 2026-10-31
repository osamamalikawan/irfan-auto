"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";
import { todayPk } from "@/lib/dates";
import { ProductPicker, type Prod } from "./InvoiceBuilder";

type Line = { key: string; p: Prod; qty: string; free: string; cost: string; disc: string };
type Sup = { id: string; name: string; balance: number };
const METHODS = [["cash", "Cash"], ["bank", "Bank"], ["cheque", "Cheque"]] as const;
const num = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));

export default function PurchaseBuilder({ supplierId }: { supplierId?: string }) {
  const router = useRouter();
  const [sup, setSup] = useState<Sup | null>(null);
  const [pickSup, setPickSup] = useState(false);
  const [pickProd, setPickProd] = useState(false);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [loc, setLoc] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [suppNo, setSuppNo] = useState("");
  const [suppDate, setSuppDate] = useState(todayPk());
  const [discount, setDiscount] = useState("");
  const [freight, setFreight] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("cash");
  const [ref, setRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID());

  useEffect(() => {
    fetch("/api/inventory/meta").then((r) => r.json()).then((j) => { const l = j.locations ?? []; setLocs(l); if (l[0]) setLoc((c) => c || l[0].id); }).catch(() => setError("Could not load locations"));
  }, []);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !supplierId) return;
    started.current = true;
    chooseSupplier({ id: supplierId, name: "", balance: 0 });
  }, [supplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseSupplier(s: Sup) {
    setPickSup(false);
    const r = await fetch("/api/suppliers/" + s.id);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the supplier");
    setSup({ id: j.supplier.id, name: j.supplier.name, balance: Number(j.supplier.balance) });
  }
  function addProduct(p: Prod) {
    const key = crypto.randomUUID();
    setLines((ls) => {
      const i = ls.findIndex((l) => l.p.id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(num(l.qty) + 1) } : l));
      return [...ls, { key, p, qty: "1", free: "", cost: "", disc: "" }];
    });
    // start from the price we paid last time
    fetch("/api/inventory/products/" + p.id).then((r) => r.json()).then((j) => {
      const last = Number(j.product?.purchase_price ?? 0);
      if (last > 0) setLines((ls) => ls.map((l) => (l.key === key && l.cost === "" ? { ...l, cost: String(last) } : l)));
    }).catch(() => {});
  }
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const calc = lines.map((l) => { const q = num(l.qty), c = num(l.cost), ld = Math.round((q * c * num(l.disc)) / 100); return { q, c, ld, amount: q * c - ld }; });
  const gross = calc.reduce((s, c) => s + c.q * c.c, 0), ldisc = calc.reduce((s, c) => s + c.ld, 0);
  const total = gross - ldisc - num(discount) + num(freight);
  const paidNow = num(paid);
  const ready = !!sup && !!loc && lines.length > 0 && calc.every((c) => c.q > 0 && c.c > 0) && total >= 0 && paidNow <= total && !busy;

  async function save() {
    if (!sup) return;
    setBusy(true); setError("");
    const body = {
      supplier_id: sup.id, location_id: loc, idem_key: idem, discount: num(discount), freight: num(freight), paid: paidNow, method, ref, remarks,
      supplier_inv_no: suppNo, supplier_inv_date: suppDate,
      lines: lines.map((l) => ({ product_id: l.p.id, qty: num(l.qty), free: num(l.free), cost: num(l.cost), disc_pct: num(l.disc) })),
    };
    const r = await fetch("/api/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the purchase");
    router.replace("/purchases/" + j.id);
  }

  return (
    <div>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/purchases" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <div className="min-w-0 flex-1"><h1 className="text-base font-bold leading-tight">New purchase</h1><p className="text-xs text-muted">Total {rs(total)}</p></div>
        <button className="btn btn-primary" disabled={!ready} onClick={save}>{busy ? "Saving…" : "Save purchase"}</button>
      </header>
      <div className="space-y-3 p-3 lg:max-w-3xl lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Supplier and delivery</h2>
          {sup ? (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><p className="font-semibold">{sup.name}</p><p className="text-sm text-muted">We owe {rs(Math.max(sup.balance, 0))}</p></div>
              <button className="btn min-h-9 px-3" onClick={() => setPickSup(true)}>Change</button>
            </div>
          ) : <button className="btn btn-primary w-full" onClick={() => setPickSup(true)}>Choose supplier</button>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label" htmlFor="pu-loc">Goods received at</label>
              <select id="pu-loc" className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div><label className="label" htmlFor="pu-sno">Supplier bill no.</label><input id="pu-sno" className="input" maxLength={40} value={suppNo} onChange={(e) => setSuppNo(e.target.value)} /></div>
            <div><label className="label" htmlFor="pu-sdate">Bill date</label><input id="pu-sdate" className="input" type="date" value={suppDate} onChange={(e) => setSuppDate(e.target.value)} /></div>
          </div>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Items received</h2><button className="btn btn-primary min-h-9 px-3" onClick={() => setPickProd(true)}>＋ Add item</button></div>
          {!lines.length && <p className="py-3 text-center text-sm text-muted">No items yet. Tap “Add item” and search the part.</p>}
          <ul className="divide-y divide-line">
            {lines.map((l, i) => (
              <li key={l.key} className="py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1"><p className="font-medium leading-snug">{l.p.name_en}</p>{l.p.name_ur && <p className="ur text-sm text-muted">{l.p.name_ur}</p>}<p className="text-xs text-muted">Stock now {l.p.on_hand} {l.p.unit}</p></div>
                  <button className="btn min-h-9 border-0 bg-transparent px-2 text-muted" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={"Remove " + l.p.name_en}>✕</button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div><label className="label" htmlFor={"q" + l.key}>Quantity</label><input id={"q" + l.key} className="input text-center font-semibold" type="number" inputMode="decimal" min="0" step="any" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} /></div>
                  <div><label className="label" htmlFor={"c" + l.key}>Price (Rs)</label><input id={"c" + l.key} className="input text-center" type="number" inputMode="decimal" min="0" step="any" value={l.cost} onChange={(e) => upd(l.key, { cost: e.target.value })} /></div>
                  <div><label className="label" htmlFor={"f" + l.key}>Free pcs</label><input id={"f" + l.key} className="input text-center" type="number" inputMode="decimal" min="0" step="any" value={l.free} onChange={(e) => upd(l.key, { free: e.target.value })} /></div>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="w-28"><label className="label" htmlFor={"d" + l.key}>Discount %</label><input id={"d" + l.key} className="input text-center" type="number" inputMode="decimal" min="0" max="100" value={l.disc} onChange={(e) => upd(l.key, { disc: e.target.value })} /></div>
                  <p className="flex-1 text-right text-lg font-semibold">{rs(calc[i].amount)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Total and payment</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Items</dt><dd>{rs(gross)}</dd></div>
            {ldisc > 0 && <div className="flex justify-between"><dt className="text-muted">Item discounts</dt><dd>− {rs(ldisc)}</dd></div>}
            {num(discount) > 0 && <div className="flex justify-between"><dt className="text-muted">Bill discount</dt><dd>− {rs(num(discount))}</dd></div>}
            {num(freight) > 0 && <div className="flex justify-between"><dt className="text-muted">Freight</dt><dd>+ {rs(num(freight))}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-lg font-bold"><dt>Total</dt><dd>{rs(total)}</dd></div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="pu-disc">Bill discount (Rs)</label><input id="pu-disc" className="input" type="number" inputMode="decimal" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div><label className="label" htmlFor="pu-fr">Freight (Rs)</label><input id="pu-fr" className="input" type="number" inputMode="decimal" min="0" value={freight} onChange={(e) => setFreight(e.target.value)} /></div>
          </div>
          <div>
            <label className="label" htmlFor="pu-paid">Paid now (Rs)</label>
            <div className="flex gap-2"><input id="pu-paid" className="input text-lg font-semibold" type="number" inputMode="decimal" min="0" placeholder="0 = on credit" value={paid} onChange={(e) => setPaid(e.target.value)} /><button className="btn shrink-0" onClick={() => setPaid(String(total))}>Paid in full</button></div>
            <p className="mt-1 text-sm text-muted">We will owe: <b className="text-ink">{rs(Math.max(total - paidNow, 0))}</b></p>
            {paidNow > total && <p className="text-sm text-red">More than the total.</p>}
            {paidNow > 0 && (
              <div className="mt-2">
                <div className="flex gap-2">{METHODS.map(([k, l]) => <button key={k} className={"chip " + (method === k ? "chip-on" : "")} onClick={() => setMethod(k)}>{l}</button>)}</div>
                {method !== "cash" && <input className="input mt-2" placeholder={method === "cheque" ? "Cheque number" : "Bank reference"} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Reference" />}
              </div>
            )}
          </div>
          <div><label className="label" htmlFor="pu-rem">Remarks (optional)</label><input id="pu-rem" className="input" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </section>
      </div>
      {pickSup && <SupplierPicker onPick={chooseSupplier} onClose={() => setPickSup(false)} />}
      {pickProd && <ProductPicker allowNoPrice onAdd={addProduct} inInvoice={Object.fromEntries(lines.map((l) => [l.p.id, num(l.qty)]))} onClose={() => setPickProd(false)} />}
    </div>
  );
}

function SupplierPicker({ onPick, onClose }: { onPick: (s: Sup) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<(Sup & { code: string; city: string | null })[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch("/api/suppliers?limit=30&q=" + encodeURIComponent(q));
      const j = await r.json().catch(() => ({}));
      if (r.ok) setRows(j.items); else setError(j.error || "Could not load suppliers");
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Choose supplier" onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2"><input className="input" autoFocus type="text" inputMode="search" placeholder="Search supplier" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search suppliers" /><button className="btn px-3" onClick={onClose} aria-label="Close">✕</button></div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
          {rows.map((s) => <li key={s.id}><button className="flex min-h-14 w-full items-center gap-2 py-2 text-left active:bg-bg" onClick={() => onPick(s)}>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.name}</span><span className="text-xs text-muted">{[s.code, s.city].filter(Boolean).join(" · ")}</span></span>
            {s.balance > 0 && <span className="pill bg-amber-bg text-amber">We owe {rs(s.balance)}</span>}</button></li>)}
        </ul>
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
        {!rows.length && !error && <p className="py-4 text-center text-sm text-muted">No supplier matches.</p>}
      </div>
    </div>
  );
}
