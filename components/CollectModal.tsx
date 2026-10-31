"use client";
import { useEffect, useState } from "react";
import { spreadPayment } from "@/lib/bills";
import { rs } from "@/lib/format";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import { Loading, Spinner } from "./Loading";

type Ledger = { balance: number; unpaid: { no: string; due: number }[] };

/** Collect money from a customer. Starts with the customer picker when no customer is given. */
export default function CollectModal({ customer: given, onClose, onDone }: { customer?: PickedCustomer | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(given ?? null);
  const [led, setLed] = useState<Ledger | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idem] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!customer) return;
    setLed(null);
    fetch("/api/customers/" + customer.id + "/ledger").then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setLed(j))).catch(() => setError("Could not load the balance"));
  }, [customer]);

  if (!customer) return <CustomerPicker onlyWithBalance onPick={setCustomer} onClose={onClose} />;

  const n = Number(amount);
  const valid = led != null && n > 0 && n <= led.balance;
  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customer!.id, amount: n, idem_key: idem }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the payment");
    onDone(rs(n) + " received from " + customer!.name);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Collect payment" onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Collect payment</h2>
        <p className="mb-3 text-sm text-muted">{customer.name}{!given && <button className="ml-2 underline" onClick={() => setCustomer(null)}>change</button>}</p>
        {!led && !error && <Loading />}
        {led && (
          <>
            <p className="text-sm text-muted">Outstanding balance</p>
            <p className="mb-3 text-2xl font-bold">{rs(led.balance)}</p>
            {led.balance <= 0 ? <p className="rounded-lg bg-green-bg p-2 text-sm text-green">This customer owes nothing.</p> : (
              <>
                <label className="label" htmlFor="col-amt">Amount received (Rs)</label>
                <div className="flex gap-2">
                  <input id="col-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" step="any" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn shrink-0" onClick={() => setAmount(String(led.balance))}>Full</button>
                </div>
                {n > led.balance && <p className="mt-1 text-sm text-red">More than the balance of {rs(led.balance)}.</p>}
                {valid && (
                  <p className="mt-2 text-sm text-muted">Settles: {spreadPayment(led.unpaid, n).map((x) => x.no + " (" + rs(x.amount) + ")").join(", ")}. Balance after: <b className="text-ink">{rs(led.balance - n)}</b></p>
                )}
              </>
            )}
          </>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Receive"}</button>
        </div>
      </div>
    </div>
  );
}
