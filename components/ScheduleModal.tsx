"use client";
import { useCallback, useEffect, useState } from "react";
import { niceDate, todayPk } from "@/lib/dates";
import { Loading, Spinner } from "./Loading";

type T = { id: string; action: "pack" | "deliver" | "complete"; due_date: string; note: string | null; done_at: string | null };
const LABEL = { pack: "Packing", deliver: "Delivery", complete: "Completion" } as const;

/** Schedule an order for packing, delivery or completion on a day. Scheduled actions show on the Tasks calendar. */
export default function ScheduleModal({ saleId, no, onClose, onChanged }: { saleId: string; no: string; onClose: () => void; onChanged: (msg: string) => void }) {
  const [tasks, setTasks] = useState<T[] | null>(null);
  const [action, setAction] = useState<"pack" | "deliver" | "complete">("deliver");
  const [date, setDate] = useState(todayPk());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/sales/" + saleId + "/tasks"); const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not load");
    setTasks(j.items);
  }, [saleId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function call(key: string, url: string, method: string, body?: object, msg?: string) {
    setBusy(key); setError("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setError(j.error || "Could not save"); return false; }
    await load(); if (msg) onChanged(msg);
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Schedule order" onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl lg:pb-4">
        <h2 className="text-base font-semibold">Schedule {no}</h2>
        <p className="mb-3 text-sm text-muted">Pick what has to happen and when. It appears on the Tasks calendar.</p>

        <form onSubmit={async (e) => { e.preventDefault(); if (await call("add", "/api/sales/" + saleId + "/tasks", "POST", { action, due_date: date, note }, LABEL[action] + " scheduled for " + niceDate(date))) setNote(""); }} className="grid grid-cols-2 gap-3">
          <div className="col-span-2" role="radiogroup" aria-label="Action">
            <p className="label">Schedule for</p>
            <div className="flex gap-2">{(["pack", "deliver", "complete"] as const).map((a) => <button key={a} type="button" role="radio" aria-checked={action === a} className={"chip " + (action === a ? "chip-on" : "")} onClick={() => setAction(a)}>{LABEL[a]}</button>)}</div>
          </div>
          <div><label className="label" htmlFor="sc-date">Date</label><input id="sc-date" className="input" type="date" min={todayPk()} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><label className="label" htmlFor="sc-note">Note (optional)</label><input id="sc-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="col-span-2"><button className="btn btn-primary w-full" disabled={!date || busy === "add"}>{busy === "add" ? <><Spinner /> Saving…</> : "Schedule"}</button></div>
        </form>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <h3 className="mb-1 mt-4 text-sm font-semibold">Scheduled</h3>
        {!tasks && !error && <Loading />}
        {tasks && !tasks.length && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
        <ul className="divide-y divide-line">
          {tasks?.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1"><b>{LABEL[t.action]}</b> · {niceDate(t.due_date)}{t.note ? " · " + t.note : ""}{t.done_at && <span className="pill ml-2 bg-green-bg text-green">Done</span>}</span>
              {!t.done_at && <button className="btn min-h-8 px-2.5 text-[13px]" disabled={busy === t.id} onClick={() => call(t.id, "/api/sale-tasks/" + t.id, "PATCH", { done: true }, LABEL[t.action] + " done")}>Do it now</button>}
              <button className="btn min-h-8 px-2.5 text-[13px] text-red" disabled={busy === t.id} onClick={() => call(t.id, "/api/sale-tasks/" + t.id, "DELETE", undefined, "Removed")}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
