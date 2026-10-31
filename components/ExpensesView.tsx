"use client";
import { useCallback, useEffect, useState } from "react";
import { monthStart, niceDate, todayPk, weekStart } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/expense";
import { rs } from "@/lib/format";
import { useMe } from "./Me";
import Toast from "./Toast";
import { Loading, Spinner } from "./Loading";

type Exp = { id: string; no: number; expense_date: string; amount: number; category: string; note: string | null; ref_type: string | null; route: string };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All"]] as const;

export default function ExpensesView() {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<Exp[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const t = todayPk();
    const p = new URLSearchParams();
    if (range === "today") { p.set("from", t); p.set("to", t); }
    if (range === "week") { p.set("from", weekStart(t)); p.set("to", t); }
    if (range === "month") { p.set("from", monthStart(t)); p.set("to", t); }
    if (category) p.set("category", category);
    const r = await fetch("/api/expenses?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load expenses");
    setError(""); setItems(j.items);
  }, [range, category]);
  useEffect(() => { load(); }, [load]);

  async function remove(e: Exp) {
    if (!window.confirm("Remove this expense of " + rs(e.amount) + "?")) return;
    const r = await fetch("/api/expenses/" + e.id + "/void", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setToast(j.error || "Could not remove");
    setToast("Expense removed"); load();
  }

  const total = (items ?? []).reduce((x, e) => x + Number(e.amount), 0);
  const fuel = (items ?? []).filter((e) => e.category === "Fuel").reduce((x, e) => x + Number(e.amount), 0);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 flex items-center justify-between lg:hidden"><h1 className="text-lg font-bold">Expenses</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          {can("accounts.edit") && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add expense</button>}
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        <div className="grid grid-cols-3 gap-2">
          {[["Total expenses", rs(total)], ["Fuel", rs(fuel)], ["Entries", String(items?.length ?? 0)]].map(([k, v]) => (
            <div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!items && !error && <Loading />}
        {items && !items.length && <p className="text-sm text-muted">No expenses for these dates.</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {items?.map((e) => (
            <li key={e.id} className="card flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className={"pill " + (e.category === "Fuel" ? "bg-amber-bg text-amber" : "bg-bg text-muted")}>{e.category}</span><span className="text-xs text-muted">{niceDate(e.expense_date)}</span></div>
                <p className="mt-1 break-words text-sm">{e.note || "—"}{e.route ? " · " + e.route : ""}</p>
              </div>
              <div className="text-right"><p className="font-semibold">{rs(e.amount)}</p>
                {can("accounts.edit") && !e.ref_type && <button className="mt-1 text-xs text-muted underline" onClick={() => remove(e)}>Remove</button>}</div>
            </li>
          ))}
        </ul>
      </div>

      {adding && <AddExpense onClose={() => setAdding(false)} onDone={() => { setAdding(false); setToast("Expense added"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function AddExpense({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayPk());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, category, note, date }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onDone();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add expense"
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="mb-3 text-base font-semibold">Add expense</h2>
        <div className="space-y-3">
          <div><label className="label" htmlFor="ex-amt">Amount (Rs)</label><input id="ex-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min="1" step="any" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="ex-cat">Category</label><select id="ex-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="ex-date">Date</label><input id="ex-date" className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div><label className="label" htmlFor="ex-note">Details</label><input id="ex-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)}>{busy ? <><Spinner /> Saving…</> : "Add"}</button></div>
      </form>
    </div>
  );
}
