"use client";
import { useCallback, useEffect, useState } from "react";
import { niceDate, todayPk } from "@/lib/dates";
import { rs } from "@/lib/format";
import { Loading, Spinner } from "./Loading";
import { usePaymentMethods } from "./PaySplit";
import Toast from "./Toast";

type Bal = { user_id: string; name: string; cash_start: string; collected: number; handed_over: number; balance: number };
type Entry = { ts: string; entry_date: string; type: "collection" | "handover"; ref: string; customer_name: string | null; method: string | null; note: string | null; amount: number; balance: number };
type Stmt = { from: string; to: string; opening: number; collected: number; handed_over: number; closing: number; truncated: boolean; entries: Entry[] };
const RANGES = [["month", "This month"], ["week", "This week"], ["today", "Today"]] as const;

export default function SalesmanCashView() {
  const [list, setList] = useState<Bal[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Bal | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/handovers");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the salesmen");
      setList(j.items ?? []); setError("");
    } catch (e) { setError((e as Error).message); setList((x) => x ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const holding = (list ?? []).reduce((s, x) => s + Math.max(0, Number(x.balance)), 0);
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Salesman cash</h1>
        <p className="text-sm text-muted">Money salesmen collected from customers, and what they have handed to the office. Open a salesman to record money you received.</p>
      </header>
      <div className="space-y-3 p-3 lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {list === null && <Loading />}
        {list && (
          <>
            <div className="card max-w-xs p-3"><p className="text-xs text-muted">Still with salesmen</p><p className="text-xl font-bold">{rs(holding)}</p></div>
            {!list.length && <p className="card p-4 text-sm text-muted">No salesmen yet.</p>}
            <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {list.map((b) => (
                <li key={b.user_id}>
                  <button className="card block w-full p-3 text-left active:opacity-70" onClick={() => setOpen(b)}>
                    <div className="flex items-center gap-2"><p className="flex-1 font-semibold">{b.name}</p><p className={"text-lg font-bold " + (b.balance > 0 ? "" : "text-muted")}>{rs(b.balance)}</p></div>
                    <p className="text-xs text-muted">Collected {rs(b.collected)} · handed over {rs(b.handed_over)} · counting from {niceDate(b.cash_start)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {open && <Detail b={open} onClose={() => { setOpen(null); load(); }} onToast={setToast} onChanged={load} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function Detail({ b, onClose, onToast, onChanged }: { b: Bal; onClose: () => void; onToast: (m: string) => void; onChanged: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [st, setSt] = useState<Stmt | null>(null);
  const [cur, setCur] = useState(b.balance);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [date, setDate] = useState(todayPk());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { methods } = usePaymentMethods();

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([fetch("/api/handovers?user=" + b.user_id + "&range=" + range), fetch("/api/handovers")]);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the statement");
      setSt(j);
      const cj = await c.json().catch(() => ({}));
      const mine = (cj.items as Bal[] | undefined)?.find((x) => x.user_id === b.user_id);
      if (mine) setCur(Number(mine.balance));
    } catch (e) { setError((e as Error).message); }
  }, [b.user_id, range]);
  useEffect(() => { setSt(null); load(); }, [load]);

  const n = Number(amount);
  const ok = n > 0 && n <= cur + 0.005;
  async function receive() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/handovers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: b.user_id, amount: n, method_id: methodId || undefined, note, date }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error || "Could not save");
      onToast(rs(n) + " received from " + b.name); setAmount(""); setNote(""); setMethodId(""); onChanged(); load();
    } catch { setError("No connection. Try again."); } finally { setBusy(false); }
  }
  async function voidEntry(e: Entry) {
    if (!window.confirm("Cancel this entry of " + rs(-e.amount) + "? The salesman's balance goes back up.")) return;
    const r = await fetch("/api/handovers/" + e.ref + "/void", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not cancel");
    onToast("Entry cancelled"); onChanged(); load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label={b.name + " cash account"} onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[94dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 text-base font-semibold">{b.name}</h2><button className="btn min-h-9" onClick={onClose}>Close</button></div>
        <p className="text-sm text-muted">Still with him</p>
        <p className="mb-3 text-2xl font-bold">{rs(cur)}</p>

        <div className="rounded-xl bg-bg p-3">
          <h3 className="mb-2 font-semibold">Received money from {b.name}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="h-amt">Amount (Rs)</label>
              <div className="flex gap-2"><input id="h-amt" className="input" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /><button className="btn shrink-0" onClick={() => setAmount(String(cur))} disabled={cur <= 0}>All</button></div></div>
            <div><label className="label" htmlFor="h-date">Date</label><input id="h-date" className="input" type="date" max={todayPk()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
          </div>
          {methods.length > 0 && (
            <div className="mt-2"><p className="label">How (optional)</p>
              <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
                {methods.map((m) => <button key={m.id} type="button" role="radio" aria-checked={methodId === m.id} className={"chip " + (methodId === m.id ? "chip-on" : "")} onClick={() => setMethodId(methodId === m.id ? "" : m.id)}>{m.name}</button>)}
              </div></div>
          )}
          <input className="input mt-2" maxLength={300} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          {n > cur + 0.005 && <p className="mt-1 text-sm text-red">He is holding only {rs(cur)}.</p>}
          {error && <p role="alert" className="mt-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
          <button className="btn btn-primary mt-2 w-full" disabled={!ok || busy} onClick={receive}>{busy ? <><Spinner /> Saving…</> : "Record received"}</button>
        </div>

        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1">
          {RANGES.map(([k, l]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        {!st && <Loading />}
        {st && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="card p-2"><p className="text-xs text-muted">Opening</p><b>{rs(st.opening)}</b></div>
              <div className="card p-2"><p className="text-xs text-muted">Collected</p><b>{rs(st.collected)}</b></div>
              <div className="card p-2"><p className="text-xs text-muted">Handed over</p><b>{rs(st.handed_over)}</b></div>
              <div className="card p-2"><p className="text-xs text-muted">Closing</p><b>{rs(st.closing)}</b></div>
            </div>
            {!st.entries.length && <p className="mt-3 text-sm text-muted">Nothing in this period.</p>}
            <ul className="mt-2 divide-y divide-line">
              {[...st.entries].reverse().map((e) => (
                <li key={e.type + e.ref} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.type === "collection" ? "Collected from " + (e.customer_name ?? "customer") : "Handed over to office"}</p>
                    <p className="text-xs text-muted">{niceDate(e.entry_date)}{e.method ? " · " + e.method : ""}{e.note ? " · " + e.note : ""}</p>
                  </div>
                  <div className="text-right"><p className={"font-semibold " + (e.amount < 0 ? "text-green" : "")}>{e.amount < 0 ? "−" : "+"}{rs(Math.abs(e.amount))}</p><p className="text-xs text-muted">bal {rs(e.balance)}</p></div>
                  {e.type === "handover" && <button className="btn min-h-9 px-2 text-xs" onClick={() => voidEntry(e)}>Cancel</button>}
                </li>
              ))}
            </ul>
            {st.truncated && <p className="mt-2 text-xs text-muted">Only the first 1,000 entries are shown. Choose a shorter period.</p>}
          </>
        )}
      </div>
    </div>
  );
}
