"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";
import { telLink, waLink } from "@/lib/phone";
import type { PromiseStatus } from "@/lib/promises";
import { VISIT_OUTCOMES } from "@/lib/schedule";
import CollectModal from "./CollectModal";
import { useMe } from "./Me";
import Toast from "./Toast";

type P = {
  customer: { id: string; code: string; name: string; phone: string | null; route: string };
  date: string; amount: number; notes: string | null; made_on: string; by: string; paid_since: number; balance: number; status: PromiseStatus;
};
type Data = { today: string; items: P[]; counts: { attention: number; upcoming: number; kept: number } };
const TABS = [["attention", "Overdue & due"], ["upcoming", "Upcoming"], ["kept", "Kept"]] as const;
const BADGE: Record<PromiseStatus, [string, string]> = { overdue: ["Overdue", "bg-red-bg text-red"], due: ["Due today", "bg-amber-bg text-amber"], upcoming: ["Upcoming", "bg-bg text-muted"], kept: ["Kept", "bg-green-bg text-green"] };

export default function PromisesView() {
  const { can } = useMe();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("attention");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [collect, setCollect] = useState<{ id: string; name: string } | null>(null);
  const [follow, setFollow] = useState<{ id: string; name: string } | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/promises");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load promises");
    setError(""); setD(j);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (d?.items ?? []).filter((p) => (tab === "attention" ? p.status === "overdue" || p.status === "due" : p.status === tab));
  const owedOverdue = (d?.items ?? []).filter((p) => p.status === "overdue" || p.status === "due").reduce((x, p) => x + Math.max(p.amount - p.paid_since, 0), 0);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="mb-2 text-lg font-bold lg:text-xl">Customer promises</h1>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {TABS.map(([k, label]) => <button key={k} className={"chip " + (tab === k ? "chip-on" : "")} onClick={() => setTab(k)}>{label}{d ? " (" + d.counts[k] + ")" : ""}</button>)}
        </div>
      </header>
      <div className="space-y-3 p-3 lg:px-5">
        <p className="text-sm text-muted">A promise to pay is recorded when a salesman saves a customer&apos;s response on a route visit. The latest promise of each customer is shown; it is kept once they have paid the promised amount.</p>
        {tab === "attention" && owedOverdue > 0 && <p className="rounded-lg bg-amber-bg p-2 text-sm text-amber">Promised but not yet received: <b>{rs(owedOverdue)}</b></p>}
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {!d && !error && <p className="text-sm text-muted">Loading…</p>}
        {d && !shown.length && <p className="text-sm text-muted">{tab === "attention" ? "No promise is due or overdue." : tab === "upcoming" ? "No upcoming promises." : "No kept promises in the last 90 days."}</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {shown.map((p) => {
            const [label, cls] = BADGE[p.status];
            return (
              <li key={p.customer.id} className="card p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1"><Link href={"/customers/" + p.customer.id} className="block truncate font-semibold hover:underline">{p.customer.name}</Link><p className="text-xs text-muted">{[p.customer.code, p.customer.route].filter(Boolean).join(" · ")}</p></div>
                  <span className={"pill " + cls}>{label}</span>
                </div>
                <p className="mt-2 text-sm">Promised {p.amount ? <b>{rs(p.amount)}</b> : "to pay"} by <b>{niceDate(p.date)}</b></p>
                <p className="text-xs text-muted">Made {niceDate(p.made_on)}{p.by ? " by " + p.by : ""}{p.notes ? " · " + p.notes : ""}</p>
                <p className="text-xs text-muted">Paid since: {rs(p.paid_since)} · customer owes {rs(Math.max(p.balance, 0))}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {telLink(p.customer.phone) && <a href={telLink(p.customer.phone)!} className="btn min-h-9 px-3 text-sm">📞 Call</a>}
                  {waLink(p.customer.phone) && <a href={waLink(p.customer.phone)!} target="_blank" rel="noreferrer" className="btn min-h-9 px-3 text-sm">WhatsApp</a>}
                  {can("payments.receive") && p.balance > 0 && p.status !== "kept" && <button className="btn btn-primary min-h-9 px-3 text-sm" onClick={() => setCollect({ id: p.customer.id, name: p.customer.name })}>Collect payment</button>}
                  {can("visits.record") && p.status !== "kept" && <button className="btn min-h-9 px-3 text-sm" onClick={() => setFollow({ id: p.customer.id, name: p.customer.name })}>Follow up</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {collect && <CollectModal customer={collect} onClose={() => setCollect(null)} onDone={(m) => { setCollect(null); setToast(m); load(); }} />}
      {follow && <FollowUp customer={follow} onClose={() => setFollow(null)} onDone={() => { setFollow(null); setToast("Follow-up saved"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function FollowUp({ customer, onClose, onDone }: { customer: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState<string>("Visited");
  const [notes, setNotes] = useState("");
  const [pDate, setPDate] = useState("");
  const [pAmt, setPAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customer.id, outcome, notes, promise_date: pDate || undefined, promise_amount: pAmt || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onDone();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Follow up"
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Follow up</h2><p className="mb-3 text-sm text-muted">{customer.name}</p>
        <label className="label" htmlFor="fu-out">What happened?</label>
        <select id="fu-out" className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{VISIT_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select>
        <label className="label mt-3" htmlFor="fu-notes">Notes</label><input id="fu-notes" className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="fu-date">New promise date</label><input id="fu-date" className="input" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} /></div>
          <div><label className="label" htmlFor="fu-amt">Amount (Rs)</label><input id="fu-amt" className="input" type="number" inputMode="decimal" min="0" value={pAmt} onChange={(e) => setPAmt(e.target.value)} /></div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </div>
  );
}
