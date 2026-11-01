"use client";
import { useEffect, useState } from "react";
import { rs } from "@/lib/format";
import { Spinner } from "./Loading";
import PaySplit, { newRow, paysTotal, toPayments, usePaymentMethods, type PayRow } from "./PaySplit";

/** Receive money against one invoice: a held counter sale, or cash on delivery. */
export default function PayInvoiceModal({ saleId, no, due, onClose, onDone }: { saleId: string; no: string; due: number; onClose: () => void; onDone: (msg: string) => void }) {
  const { methods } = usePaymentMethods();
  const [rows, setRows] = useState<PayRow[]>([]);
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (methods.length && !rows.length) setRows([newRow((methods.find((m) => m.name.toLowerCase() === "cash") ?? methods[0]).id, String(due))]);
  }, [methods, rows.length, due]);

  const got = paysTotal(rows);
  const valid = got > 0 && got <= due;
  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/sales/" + saleId + "/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payments: toPayments(rows, true, got) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the payment");
    onDone(rs(got) + " received for " + no);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Receive payment" onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Receive payment for {no}</h2>
        <p className="mb-3 text-sm text-muted">Due on this invoice</p>
        <p className="mb-3 text-2xl font-bold">{rs(due)}</p>
        <PaySplit methods={methods} rows={rows} setRows={setRows} split={split} setSplit={setSplit} total={due} mode="amount" />
        {got > due && <p className="mt-2 text-sm text-red">More than the amount due.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Receive"}</button>
        </div>
      </div>
    </div>
  );
}
