"use client";
import { useState } from "react";
import { rs } from "@/lib/format";
import { Spinner } from "./Loading";

const METHODS = [["cash", "Cash"], ["bank", "Bank"], ["cheque", "Cheque"]] as const;

export default function PaySupplierModal({ supplier, balance, onClose, onDone }: { supplier: { id: string; name: string }; balance: number; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("cash");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID());
  const n = Number(amount);

  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/supplier-payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_id: supplier.id, amount: n, method, ref, note, idem_key: idem }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the payment");
    onDone(rs(n) + " paid to " + supplier.name);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Pay supplier" onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Pay supplier</h2>
        <p className="text-sm text-muted">{supplier.name}</p>
        <p className="mt-2 text-sm text-muted">We owe</p><p className="mb-3 text-2xl font-bold">{rs(Math.max(balance, 0))}</p>
        <label className="label" htmlFor="ps-amt">Amount paid (Rs)</label>
        <div className="flex gap-2">
          <input id="ps-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" step="any" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          {balance > 0 && <button className="btn shrink-0" onClick={() => setAmount(String(balance))}>Full</button>}
        </div>
        {n > balance && balance >= 0 && n > 0 && <p className="mt-1 text-sm text-amber">More than we owe. The extra will show as an advance.</p>}
        <div className="mt-3 flex gap-2">{METHODS.map(([k, l]) => <button key={k} className={"chip " + (method === k ? "chip-on" : "")} onClick={() => setMethod(k)}>{l}</button>)}</div>
        {method !== "cash" && <input className="input mt-2" placeholder={method === "cheque" ? "Cheque number" : "Bank reference"} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Reference" />}
        <input className="input mt-2" placeholder="Note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!(n > 0) || busy} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Pay"}</button></div>
      </div>
    </div>
  );
}
