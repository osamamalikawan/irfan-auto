"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { qty as fmtQty, rs } from "@/lib/format";

type M = { id: string; no: string; purchase_date: string; qty: number; cost: number; total: number; vendor: string | null; sale_id: string | null; sale_no: string | null; sale_amount: number; margin: number; product: { name_en: string; name_ur: string | null } | null };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;

export default function MarketView() {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [items, setItems] = useState<M[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const t = todayPk();
    const p = new URLSearchParams();
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    const r = await fetch("/api/market?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load market purchases");
    setError(""); setItems(j.items);
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const sum = (k: "total" | "sale_amount" | "margin") => (items ?? []).reduce((x, m) => x + m[k], 0);
  const tile = (k: string, v: string, cls = "") => (<div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-lg font-bold " + cls}>{v}</p></div>);
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="mb-2 text-lg font-bold lg:text-xl">Market purchases</h1>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">{RANGES.map(([k, l]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{l}</button>)}</div>
      </header>
      <div className="space-y-3 p-3 lg:px-5">
        <p className="text-sm text-muted">Parts we did not have in stock, bought from the market for a customer&apos;s invoice. Add them with “Buy from market” when making an invoice. Each purchase is also recorded in Expenses.</p>
        <div className="grid grid-cols-3 gap-2">{tile("Bought for", rs(sum("total")))}{tile("Sold for", rs(sum("sale_amount")))}{tile("Margin", rs(sum("margin")), sum("margin") < 0 ? "text-red" : "text-green")}</div>
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!items && !error && <p className="text-sm text-muted">Loading…</p>}
        {items && !items.length && <p className="text-sm text-muted">No market purchases in these dates.</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items?.map((m) => (
            <li key={m.id} className="card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><p className="font-semibold leading-snug">{m.product?.name_en ?? "Part"}</p>{m.product?.name_ur && <p className="ur text-sm text-muted">{m.product.name_ur}</p>}
                  <p className="text-xs text-muted">{m.no} · {niceDate(m.purchase_date)}{m.vendor ? " · from " + m.vendor : ""}</p></div>
                <span className={"pill " + (m.margin < 0 ? "bg-red-bg text-red" : "bg-green-bg text-green")}>{m.margin >= 0 ? "+" : ""}{rs(m.margin)}</span>
              </div>
              <p className="mt-1 text-sm">{fmtQty(m.qty)} × {rs(m.cost)} = <b>{rs(m.total)}</b> · sold for <b>{rs(m.sale_amount)}</b></p>
              {m.sale_id && <Link href={"/sales/" + m.sale_id} className="text-xs underline">Invoice {m.sale_no}</Link>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
