"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate, todayPk } from "@/lib/dates";
import { rs } from "@/lib/format";
import { telLink } from "@/lib/phone";
import { FREQ_LABEL, VISIT_OUTCOMES, addDays, weekdayName, type Freq } from "@/lib/schedule";
import { useMe } from "./Me";
import { CompleteModal } from "./RoutePlansView";
import Toast from "./Toast";

type Resp = { outcome: string; notes: string | null; promise_date: string | null; promise_amount: number | null; visit_date?: string };
type Cust = { id: string; code: string; name: string; name_ur: string | null; owner: string | null; phone: string | null; address: string | null; area: string; balance: number; response: Resp | null; previous: Resp | null };
type Plan = {
  route: { id: string; name: string; code: string | null; frequency: Freq; fuel_cost: number; salesman: { name: string } | null; schedule: string; areas: string[] };
  date: string; scheduled: boolean; status: "planned" | "overdue" | "completed";
  run: { id: string; fuel_cost: number; note: string | null; completed_at: string } | null; customers: Cust[];
};

export default function RoutePlanDetail({ routeId, date }: { routeId: string; date: string }) {
  const { can } = useMe();
  const [d, setD] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState("");
  const today = todayPk();

  const load = useCallback(async () => {
    const r = await fetch("/api/route-plans/" + routeId + "/" + date);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the plan");
    setD(j);
  }, [routeId, date]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="p-4 text-red">{error} <Link href="/route-plans" className="underline">Back</Link></p>;
  if (!d) return <p className="p-4 text-muted">Loading…</p>;
  const canRespond = can("visits.record") && date <= today && date >= addDays(today, -31);
  const canComplete = (can("routes.manage") || can("visits.record")) && d.status !== "completed" && date <= today;
  const responded = d.customers.filter((c) => c.response).length;
  const owed = d.customers.reduce((x, c) => x + Math.max(c.balance, 0), 0);
  const promises = d.customers.filter((c) => c.response?.promise_date).length;
  const badge = d.status === "completed" ? "bg-green-bg text-green" : d.status === "overdue" ? "bg-red-bg text-red" : "bg-amber-bg text-amber";

  return (
    <div>
      <header data-noprint className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-4 lg:pt-4">
        <Link href="/route-plans" className="btn border-0 bg-transparent px-3 text-xl" aria-label="Back">←</Link>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-bold">{d.route.name}</h1><p className="text-xs text-muted">{weekdayName(date)} {niceDate(date)}</p></div>
        <span className={"pill " + badge}>{d.status === "completed" ? "Completed" : d.status === "overdue" ? "Overdue" : "Planned"}</span>
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        <section className="card p-4">
          <div className="hidden print:block"><p className="text-lg font-bold">Irfan Autos: route plan</p></div>
          <p className="text-lg font-semibold">{d.route.name} {d.route.code && <span className="text-sm font-normal text-muted">{d.route.code}</span>}</p>
          <p className="text-sm text-muted">{niceDate(date)} · {d.route.salesman ? d.route.salesman.name : "no salesman"} · {FREQ_LABEL[d.route.frequency]}: {d.route.schedule}</p>
          {d.route.areas.length > 0 && <p className="text-xs text-muted">{d.route.areas.join(", ")}</p>}
          {!d.scheduled && <p className="mt-2 rounded-lg bg-bg p-2 text-sm text-muted">This route is not scheduled on this date. You can still record responses.</p>}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-muted">Responded</dt><dd className="text-lg font-bold">{responded} / {d.customers.length}</dd></div>
            <div><dt className="text-xs text-muted">Customers owe</dt><dd className="text-lg font-bold">{rs(owed)}</dd></div>
            <div><dt className="text-xs text-muted">Promises</dt><dd className="text-lg font-bold">{promises}</dd></div>
          </dl>
          {d.run && <p className="mt-2 text-sm text-muted">Completed {new Date(d.run.completed_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })} · fuel {rs(d.run.fuel_cost)}{d.run.note ? " · " + d.run.note : ""}</p>}
          <div data-noprint className="mt-3 flex flex-wrap gap-2">
            <button className="btn" onClick={() => window.print()}>Print</button>
            {canComplete && <button className="btn btn-primary" onClick={() => setComplete(true)}>Complete route</button>}
          </div>
        </section>

        {/* on paper: a sheet the salesman can write the responses on */}
        <table className="hidden w-full border-collapse text-sm print:table">
          <thead><tr className="border-b-2 border-black text-left"><th className="py-1">#</th><th>Customer</th><th>Phone</th><th className="text-right">Owes</th><th>Last response</th><th className="w-1/4">Response today</th></tr></thead>
          <tbody>{d.customers.map((c, i) => (
            <tr key={c.id} className="border-b border-black align-top"><td className="py-1.5">{i + 1}</td><td>{c.name}<br /><span className="text-xs">{c.area}</span></td><td>{c.phone}</td>
              <td className="text-right">{c.balance > 0 ? rs(c.balance) : ""}</td><td className="text-xs">{c.previous ? (c.previous.visit_date ? niceDate(c.previous.visit_date) + ": " : "") + c.previous.outcome : ""}</td><td className="h-10" /></tr>
          ))}</tbody>
        </table>

        <ul className="space-y-2 print:hidden">
          {d.customers.map((c) => (
            <li key={c.id} className="card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={"/customers/" + c.id} className="block font-semibold leading-snug hover:underline">{c.name}</Link>
                  {c.name_ur && <p className="ur text-sm text-muted">{c.name_ur}</p>}
                  <p className="text-xs text-muted">{[c.area, c.owner, c.address].filter(Boolean).join(" · ")}</p>
                </div>
                {c.balance > 0 && <span className="pill bg-red-bg text-red">Owes {rs(c.balance)}</span>}
              </div>
              {c.previous && !c.response && (
                <p className="mt-1 text-xs text-muted">Last time ({c.previous.visit_date ? niceDate(c.previous.visit_date) : ""}): {c.previous.outcome}{c.previous.notes ? " — " + c.previous.notes : ""}{c.previous.promise_date ? " · promised " + (c.previous.promise_amount ? rs(c.previous.promise_amount) + " " : "") + "by " + niceDate(c.previous.promise_date) : ""}</p>
              )}
              {c.response && (
                <div className="mt-2 rounded-lg bg-green-bg p-2 text-sm text-green">
                  <b>{c.response.outcome}</b>{c.response.notes ? " — " + c.response.notes : ""}
                  {c.response.promise_date && <span className="block">Promised {c.response.promise_amount ? rs(c.response.promise_amount) + " " : ""}by {niceDate(c.response.promise_date)}</span>}
                </div>
              )}
              <div data-noprint className="mt-2 flex gap-2">
                {telLink(c.phone) && <a href={telLink(c.phone)!} className="btn min-h-9 flex-1 justify-start text-sm">📞 {c.phone}</a>}
                {canRespond && <button className={"btn min-h-9 flex-1 " + (c.response ? "" : "btn-primary")} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>{c.response ? "Add another" : "Record response"}</button>}
              </div>
              {open === c.id && <ResponseForm customerId={c.id} date={date} onDone={() => { setOpen(null); setToast("Response saved"); load(); }} />}
            </li>
          ))}
        </ul>
        {!d.customers.length && <p className="text-sm text-muted">No customers on this route yet.</p>}
      </div>

      {complete && <CompleteModal routeId={routeId} name={d.route.name} date={date} fuel={d.route.fuel_cost} onClose={() => setComplete(false)} onDone={() => { setComplete(false); setToast("Route completed"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function ResponseForm({ customerId, date, onDone }: { customerId: string; date: string; onDone: () => void }) {
  const [outcome, setOutcome] = useState<string>(VISIT_OUTCOMES[0]);
  const [notes, setNotes] = useState("");
  const [pDate, setPDate] = useState("");
  const [pAmt, setPAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customerId, outcome, notes, date, promise_date: pDate || undefined, promise_amount: pAmt || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the response");
    onDone();
  }
  return (
    <form onSubmit={save} data-noprint className="mt-2 space-y-2 rounded-xl border border-line p-3">
      <div><label className="label" htmlFor={"o" + customerId}>Customer's response</label>
        <select id={"o" + customerId} className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{VISIT_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></div>
      <div><label className="label" htmlFor={"n" + customerId}>Notes</label><input id={"n" + customerId} className="input" maxLength={300} placeholder="What the customer said" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor={"pd" + customerId}>Promised to pay by</label><input id={"pd" + customerId} className="input" type="date" min={todayPk()} value={pDate} onChange={(e) => setPDate(e.target.value)} /></div>
        <div><label className="label" htmlFor={"pa" + customerId}>Promised amount (Rs)</label><input id={"pa" + customerId} className="input" type="number" inputMode="decimal" min="0" value={pAmt} onChange={(e) => setPAmt(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save response"}</button>
    </form>
  );
}
