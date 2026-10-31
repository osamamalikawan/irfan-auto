"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import { Loading } from "./Loading";

type V = { key: string; no: string; type: "received" | "paid"; date: string; party: string; amount: number; reversed: boolean; details: string };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;

export default function VouchersView() {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [type, setType] = useState("");
  const [items, setItems] = useState<V[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const t = todayPk();
    const p = new URLSearchParams();
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    if (type) p.set("type", type);
    const r = await fetch("/api/vouchers?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load vouchers");
    setError(""); setItems(j.items);
  }, [range, type]);
  useEffect(() => { load(); }, [load]);

  const rec = (items ?? []).filter((v) => v.type === "received" && !v.reversed).reduce((x, v) => x + v.amount, 0);
  const paid = (items ?? []).filter((v) => v.type === "paid").reduce((x, v) => x + v.amount, 0);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Payment vouchers</h1></div>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Voucher type">
          <option value="">All vouchers</option><option value="received">Received (credit)</option><option value="paid">Paid (debit)</option>
        </select>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
      </header>
      <div className="space-y-3 p-3 lg:px-5">
        <div className="grid grid-cols-3 gap-2">
          {[["Received", rs(rec)], ["Paid out", rs(paid)], ["Vouchers", String(items?.length ?? 0)]].map(([k, v]) => (
            <div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!items && !error && <Loading />}
        {items && !items.length && <p className="text-sm text-muted">No vouchers for these dates.</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items?.map((v) => (
            <li key={v.key}>
              <Link href={"/vouchers/" + v.key} className="card flex items-start gap-2 p-3 active:opacity-70">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><b>{v.no}</b>
                    <span className={"pill " + (v.type === "received" ? "bg-green-bg text-green" : "bg-amber-bg text-amber")}>{v.type === "received" ? "Received" : "Paid"}</span>
                    {v.reversed && <span className="pill bg-bg text-muted">Reversed</span>}</div>
                  <p className="mt-1 truncate text-sm">{v.party}</p>
                  <p className="truncate text-xs text-muted">{niceDate(v.date)}{v.details ? " · " + v.details : ""}</p>
                </div>
                <p className={"font-semibold " + (v.reversed ? "text-muted line-through" : "")}>{rs(v.amount)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
