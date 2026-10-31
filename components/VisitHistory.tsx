"use client";
import { useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";

type V = { id: string; visit_date: string; outcome: string; notes: string | null; promise_date: string | null; promise_amount: number | null; by: string; route: string };

/** The customer's recent visit responses, on the customer profile. */
export default function VisitHistory({ customerId }: { customerId: string }) {
  const [v, setV] = useState<V[] | null>(null);
  useEffect(() => { fetch("/api/customers/" + customerId + "/visits").then((r) => r.json()).then((j) => setV(j.visits ?? [])).catch(() => setV([])); }, [customerId]);
  if (!v) return null;
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold">Visit responses</h2>
      {!v.length && <p className="text-sm text-muted">No visits recorded yet.</p>}
      <ul className="divide-y divide-line">
        {v.map((x) => (
          <li key={x.id} className="py-2 text-sm">
            <div className="flex items-center gap-2"><b>{x.outcome}</b><span className="text-xs text-muted">{niceDate(x.visit_date)}{x.route ? " · " + x.route : ""}{x.by ? " · " + x.by : ""}</span></div>
            {x.notes && <p className="text-muted">{x.notes}</p>}
            {x.promise_date && <p className="text-xs text-amber">Promised {x.promise_amount ? rs(x.promise_amount) + " " : ""}by {niceDate(x.promise_date)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
