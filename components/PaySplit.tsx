"use client";
import { useEffect, useState } from "react";
import { rs } from "@/lib/format";

export type Method = { id: string; name: string };
export type PayRow = { key: string; method_id: string; amount: string };

const num = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
export const newRow = (method_id: string, amount = ""): PayRow => ({ key: crypto.randomUUID(), method_id, amount });

/** Active payment methods (Cash, Bank, Easypaisa ... as set in Settings). */
export function usePaymentMethods() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/payment-methods").then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setMethods(j.methods ?? []))).catch(() => setError("Could not load payment methods"));
  }, []);
  return { methods, error, ready: methods.length > 0 };
}

/** What to send to the server: one payment per method with an amount. */
export function toPayments(rows: PayRow[], split: boolean, total: number) {
  if (!split) return rows[0]?.method_id && total > 0 ? [{ method_id: rows[0].method_id, amount: total }] : [];
  return rows.filter((r) => r.method_id && num(r.amount) > 0).map((r) => ({ method_id: r.method_id, amount: num(r.amount) }));
}
export const paysTotal = (rows: PayRow[]) => rows.reduce((s, r) => s + num(r.amount), 0);

/**
 * mode "full": the whole total is paid. One method by default, or split it between several.
 * mode "amount": any amounts (money received now on a ledger sale, or part of an invoice).
 */
export default function PaySplit({ methods, rows, setRows, split, setSplit, total, mode }: {
  methods: Method[]; rows: PayRow[]; setRows: (r: PayRow[]) => void; split: boolean; setSplit: (v: boolean) => void; total: number; mode: "full" | "amount";
}) {
  const upd = (key: string, patch: Partial<PayRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const entered = paysTotal(rows);
  const left = total - entered;
  const showRows = mode === "amount" || split;

  if (!methods.length) return <p className="text-sm text-muted">Loading payment methods…</p>;

  if (!showRows) {
    return (
      <div>
        <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={rows[0]?.method_id === m.id} className={"chip " + (rows[0]?.method_id === m.id ? "chip-on" : "")}
              onClick={() => setRows([{ ...(rows[0] ?? newRow(m.id)), method_id: m.id }])}>{m.name}</button>
          ))}
        </div>
        {methods.length > 1 && <button type="button" className="mt-2 text-sm text-accent underline" onClick={() => { setRows([{ ...(rows[0] ?? newRow(methods[0].id)), amount: String(total) }]); setSplit(true); }}>Split between methods</button>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-2">
          <select className="input w-40 shrink-0" aria-label="Payment method" value={r.method_id} onChange={(e) => upd(r.key, { method_id: e.target.value })}>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className="input min-w-0 flex-1 text-lg font-semibold" type="number" inputMode="decimal" min="0" step="any" placeholder="Amount" aria-label={"Amount by " + (methods.find((m) => m.id === r.method_id)?.name ?? "method")}
            value={r.amount} onChange={(e) => upd(r.key, { amount: e.target.value })} />
          {total > 0 && left > 0 && i === rows.length - 1 && <button type="button" className="btn shrink-0 px-3" onClick={() => upd(r.key, { amount: String(num(r.amount) + left) })}>Rest</button>}
          {rows.length > 1 && <button type="button" className="btn shrink-0 border-0 bg-transparent px-2 text-muted" aria-label="Remove" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>✕</button>}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {rows.length < methods.length && <button type="button" className="text-accent underline" onClick={() => setRows([...rows, newRow(methods.find((m) => !rows.some((r) => r.method_id === m.id))?.id ?? methods[0].id)])}>＋ Add method</button>}
        {mode === "full" && <button type="button" className="text-muted underline" onClick={() => { setRows([{ ...rows[0], amount: "" }]); setSplit(false); }}>One method</button>}
        <span className="ml-auto text-muted">
          Entered <b className="text-ink">{rs(entered)}</b>{total > 0 && mode === "full" ? (left === 0 ? " · matches the total" : left > 0 ? " · " + rs(left) + " left" : " · " + rs(-left) + " too much") : ""}
        </span>
      </div>
    </div>
  );
}
