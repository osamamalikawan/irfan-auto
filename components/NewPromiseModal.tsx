"use client";
import { useEffect, useState } from "react";
import { todayPk } from "@/lib/dates";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import { Spinner } from "./Loading";

/** Record a customer's promise to pay: who, how much, and the date. It then shows on Promises and on the Tasks calendar. */
export default function NewPromiseModal({ presetDate, preset, onClose, onSaved }: { presetDate?: string; preset?: PickedCustomer; onClose: () => void; onSaved: (msg: string) => void }) {
  const [cust, setCust] = useState<PickedCustomer | null>(preset ?? null);
  const [pick, setPick] = useState(!preset);
  const [date, setDate] = useState(presetDate && presetDate >= todayPk() ? presetDate : todayPk());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pick) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pick, onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cust) return setError("Choose a customer.");
    setBusy(true); setError("");
    const r = await fetch("/api/promises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: cust.id, promise_date: date, promise_amount: Number(amount), notes }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the promise");
    onSaved("Promise saved for " + cust.name);
  }

  if (pick) return <CustomerPicker onPick={(c) => { setCust(c); setPick(false); }} onClose={() => (cust ? setPick(false) : onClose())} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label="New promise" onSubmit={save} onClick={(e) => e.stopPropagation()} className="grid w-full max-w-md grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h2 className="col-span-2 text-base font-semibold">New promise to pay</h2>
        <div className="col-span-2 flex items-center gap-2"><div className="min-w-0 flex-1"><p className="label mb-0">Customer</p><p className="truncate font-semibold">{cust?.name}</p></div><button type="button" className="btn min-h-9 px-3" onClick={() => setPick(true)}>Change</button></div>
        <div><label className="label" htmlFor="np-date">Promised date</label><input id="np-date" className="input" type="date" min={todayPk()} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><label className="label" htmlFor="np-amt">Amount (Rs)</label><input id="np-amt" className="input text-right" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} required /></div>
        <div className="col-span-2"><label className="label" htmlFor="np-note">Note (optional)</label><input id="np-note" className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {error && <p role="alert" className="col-span-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !cust || !(Number(amount) > 0)}>{busy ? <><Spinner /> Saving…</> : "Save promise"}</button></div>
      </form>
    </div>
  );
}
