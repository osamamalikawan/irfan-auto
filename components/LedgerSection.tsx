"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";
import CollectModal from "./CollectModal";
import { useMe } from "./Me";
import Toast from "./Toast";

type Statement = {
  balance: number; opening: number; closing: number; totalDebit: number; totalCredit: number;
  rows: { date: string; type: string; label: string; debit: number; credit: number; balance: number }[];
  unpaid: { no: string; due: number }[];
};

/** Balance, statement and quick actions on the customer profile. */
export default function LedgerSection({ customerId, customerName, isWalkIn, onChanged }: { customerId: string; customerName: string; isWalkIn: boolean; onChanged?: () => void }) {
  const { can } = useMe();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [d, setD] = useState<Statement | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const r = await fetch("/api/customers/" + customerId + "/ledger?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the statement");
    setError(""); setD(j);
  }, [customerId, from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Balance (customer owes)</p>
          <p className={"text-2xl font-bold " + (d && d.balance > 0 ? "text-red" : "")}>{d ? rs(d.balance) : "…"}</p>
        </div>
        {can("sales.create") && <Link href={"/sales/new?customer=" + customerId} className="btn btn-primary">New invoice</Link>}
        {can("payments.receive") && !isWalkIn && d && d.balance > 0 && <button className="btn" onClick={() => setCollect(true)}>Collect payment</button>}
      </div>
      {d && d.unpaid.length > 0 && <p className="mt-2 text-xs text-muted">Unpaid: {d.unpaid.map((b) => b.no + " " + rs(b.due)).join(" · ")}</p>}

      <h2 className="mb-2 mt-4 font-semibold">Statement</h2>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="st-from">From</label><input id="st-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="st-to">To</label><input id="st-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      {d && !d.rows.length && <p className="text-sm text-muted">No entries in this period.</p>}
      {d && d.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-xs text-muted">
              <th className="border-b border-line py-1.5 pr-2 font-semibold">Date</th><th className="border-b border-line py-1.5 pr-2 font-semibold">Details</th>
              <th className="border-b border-line py-1.5 pr-2 text-right font-semibold">Debit</th><th className="border-b border-line py-1.5 pr-2 text-right font-semibold">Credit</th><th className="border-b border-line py-1.5 text-right font-semibold">Balance</th>
            </tr></thead>
            <tbody>
              {from && <tr><td className="py-1.5 pr-2 text-xs">{niceDate(from)}</td><td className="py-1.5 pr-2 italic text-muted">Brought forward</td><td /><td /><td className="py-1.5 text-right">{rs(d.opening)}</td></tr>}
              {d.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs">{niceDate(r.date)}</td><td className="py-1.5 pr-2">{r.label}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{r.debit ? rs(r.debit) : ""}</td><td className="whitespace-nowrap py-1.5 pr-2 text-right">{r.credit ? rs(r.credit) : ""}</td>
                  <td className="whitespace-nowrap py-1.5 text-right font-medium">{rs(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-line font-semibold"><td className="py-1.5" colSpan={2}>Totals</td><td className="py-1.5 pr-2 text-right">{rs(d.totalDebit)}</td><td className="py-1.5 pr-2 text-right">{rs(d.totalCredit)}</td><td className="py-1.5 text-right">{rs(d.closing)}</td></tr></tfoot>
          </table>
        </div>
      )}
      {collect && <CollectModal customer={{ id: customerId, name: customerName }} onClose={() => setCollect(false)} onDone={(m) => { setCollect(false); setToast(m); load(); onChanged?.(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </section>
  );
}
