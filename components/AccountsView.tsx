"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import { Loading } from "./Loading";

type Data = {
  summary: { sales: number; returns: number; collected: number; purchases: number; supplier_paid: number; expenses: number; receivable: number; payable: number };
  cash_book: { day: string; money_in: number; money_out: number }[];
  debtors: { id: string; name: string; balance: number }[]; creditors: { id: string; name: string; balance: number }[];
};
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All time"]] as const;

export default function AccountsView() {
  const [range, setRange] = useState<(typeof RANGES)[number][0] | "custom">("month");
  const t = todayPk();
  const [from, setFrom] = useState(monthStart(t));
  const [to, setTo] = useState(t);
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");

  function pick(k: (typeof RANGES)[number][0]) {
    setRange(k);
    if (k === "today") { setFrom(t); setTo(t); }
    if (k === "week") { setFrom(weekStart(t)); setTo(t); }
    if (k === "month") { setFrom(monthStart(t)); setTo(t); }
    if (k === "all") { setFrom(""); setTo(""); }
  }
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const r = await fetch("/api/accounts?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load accounts");
    setError(""); setD(j);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const s = d?.summary;
  const out = s ? s.supplier_paid + s.expenses : 0;
  const tile = (k: string, v: number, sub?: string, cls = "") => (<div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-lg font-bold " + cls}>{rs(v)}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Accounts</h1></div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => pick(k)}>{label}</button>)}
        </div>
        <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
          <div><label className="label" htmlFor="ac-from">From</label><input id="ac-from" className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setRange("custom"); }} /></div>
          <div><label className="label" htmlFor="ac-to">To</label><input id="ac-to" className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setRange("custom"); }} /></div>
        </div>
      </header>
      <div className="space-y-3 p-3 lg:px-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!d && !error && <Loading />}
        {s && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {tile("Sales", s.sales, "returns " + rs(s.returns))}
              {tile("Purchases", s.purchases)}
              {tile("Money in (collected)", s.collected, undefined, "text-green")}
              {tile("Money out", out, "suppliers " + rs(s.supplier_paid) + " · expenses " + rs(s.expenses), "text-amber")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tile("Customers owe us", s.receivable)}
              {tile("We owe suppliers", s.payable)}
            </div>
            <p className="text-sm text-muted">Net money movement in this period: <b className={s.collected - out >= 0 ? "text-green" : "text-red"}>{rs(s.collected - out)}</b>. Receivable and payable are balances today, not for the period.</p>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="card p-4">
                <h2 className="mb-2 font-semibold">Biggest customer balances</h2>
                {!d!.debtors.length && <p className="text-sm text-muted">No customer owes anything.</p>}
                <ul className="divide-y divide-line">{d!.debtors.map((x) => <li key={x.id}><Link href={"/customers/" + x.id} className="flex justify-between py-2 text-sm active:opacity-70"><span className="truncate pr-2">{x.name}</span><b>{rs(x.balance)}</b></Link></li>)}</ul>
              </section>
              <section className="card p-4">
                <h2 className="mb-2 font-semibold">Biggest supplier balances</h2>
                {!d!.creditors.length && <p className="text-sm text-muted">We owe no supplier.</p>}
                <ul className="divide-y divide-line">{d!.creditors.map((x) => <li key={x.id}><Link href={"/suppliers/" + x.id} className="flex justify-between py-2 text-sm active:opacity-70"><span className="truncate pr-2">{x.name}</span><b>{rs(x.balance)}</b></Link></li>)}</ul>
              </section>
            </div>

            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Daily money book</h2>
              {!d!.cash_book.length && <p className="text-sm text-muted">No money moved in this period.</p>}
              {d!.cash_book.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="text-left text-xs text-muted"><th className="border-b border-line py-1.5 font-semibold">Date</th><th className="border-b border-line py-1.5 text-right font-semibold">In</th><th className="border-b border-line py-1.5 text-right font-semibold">Out</th><th className="border-b border-line py-1.5 text-right font-semibold">Net</th></tr></thead>
                    <tbody>{d!.cash_book.map((r) => (
                      <tr key={r.day} className="border-t border-line"><td className="py-1.5">{niceDate(r.day)}</td><td className="py-1.5 text-right">{r.money_in ? rs(r.money_in) : ""}</td><td className="py-1.5 text-right">{r.money_out ? rs(r.money_out) : ""}</td>
                        <td className={"py-1.5 text-right font-medium " + (r.money_in - r.money_out < 0 ? "text-red" : "")}>{rs(r.money_in - r.money_out)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">In = customer payments. Out = supplier payments and expenses (including cash refunds). Cash, bank and cheque are not separated yet.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
