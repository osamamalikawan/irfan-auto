"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";

type V = { no: string; type: string; title: string; date: string; party: string; code: string; amount: number; reversed: boolean; details: string; route?: string; balance_after: number | null; by: string };

export default function VoucherView({ type, id }: { type: string; id: string }) {
  const [v, setV] = useState<V | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/vouchers/" + type + "/" + id).then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setV(j.voucher))).catch(() => setError("Could not load the voucher"));
  }, [type, id]);
  if (error) return <p className="p-4 text-red">{error} <Link href="/vouchers" className="underline">Back</Link></p>;
  if (!v) return <p className="p-4 text-muted">Loading…</p>;
  return (
    <div>
      <header data-noprint className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/vouchers" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <h1 className="flex-1 text-base font-bold">{v.no}</h1>
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </header>
      <div className="p-3 lg:max-w-xl lg:px-5">
        <section className="card p-5">
          <p className="text-center text-lg font-bold">Irfan Autos</p>
          <p className="mb-3 text-center text-sm text-muted">{v.title}</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Voucher no.</dt><dd className="font-semibold">{v.no}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Date</dt><dd>{niceDate(v.date)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{v.type === "received" ? "Received from" : "Paid for"}</dt><dd className="text-right font-medium">{v.party}{v.code ? " (" + v.code + ")" : ""}</dd></div>
            {v.details && <div className="flex justify-between gap-4"><dt className="text-muted">Details</dt><dd className="text-right">{v.details}</dd></div>}
            {v.route && <div className="flex justify-between"><dt className="text-muted">Route</dt><dd>{v.route}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-xl font-bold"><dt>Amount</dt><dd className={v.reversed ? "line-through" : ""}>{rs(v.amount)}</dd></div>
            {v.balance_after !== null && <div className="flex justify-between"><dt className="text-muted">Balance after this payment</dt><dd>{rs(v.balance_after)}</dd></div>}
            {v.reversed && <p className="rounded-lg bg-bg p-2 text-center text-muted">This payment was reversed (invoice cancelled).</p>}
          </dl>
          <div className="mt-8 flex justify-between text-xs text-muted"><span>Prepared by: {v.by || "—"}</span><span>Signature: ____________</span></div>
        </section>
      </div>
    </div>
  );
}
