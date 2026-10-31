"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate, todayPk, weekStart } from "@/lib/dates";
import { rs } from "@/lib/format";
import { FREQ_LABEL, addDays, daysInMonth, weekdayName, type Freq } from "@/lib/schedule";
import { useMe } from "./Me";
import Toast from "./Toast";
import { Loading, Spinner } from "./Loading";

type Entry = { key: string; date: string; route_id: string; name: string; code: string | null; frequency: Freq; salesman: string; planned: number; fuel_cost: number; areas: string[]; status: "planned" | "overdue" | "completed"; run_id: string | null };
type Run = { id: string; route_id: string; date: string; route: string; code: string; salesman: string; planned: number; visited: number; productive: number; sales: number; collections: number; fuel: number; note: string | null };
const RANGES = [["upcoming", "Overdue & next 7 days"], ["today", "Today"], ["week", "This week"], ["month", "This month"]] as const;

function bounds(k: (typeof RANGES)[number][0]) {
  const t = todayPk();
  if (k === "today") return { from: t, to: t };
  if (k === "week") { const m = weekStart(t); return { from: m, to: addDays(m, 6) }; }
  if (k === "month") return { from: t.slice(0, 8) + "01", to: t.slice(0, 8) + String(daysInMonth(t.slice(0, 7))).padStart(2, "0") };
  return { from: addDays(t, -14), to: addDays(t, 7) };
}

export default function RoutePlansView() {
  const { can } = useMe();
  const [tab, setTab] = useState<"planned" | "completed">("planned");
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("upcoming");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Entry | null>(null);
  const [toast, setToast] = useState("");
  const today = todayPk();

  const load = useCallback(async () => {
    const { from, to } = bounds(range);
    setError("");
    if (tab === "planned") {
      setEntries(null);
      const r = await fetch("/api/route-plans?from=" + from + "&to=" + to);
      const j = await r.json();
      if (!r.ok) return setError(j.error || "Could not load route plans");
      setEntries(j.items);
    } else {
      setRuns(null);
      const r = await fetch("/api/route-runs?from=" + from + "&to=" + to);
      const j = await r.json();
      if (!r.ok) return setError(j.error || "Could not load completed routes");
      setRuns(j.items);
    }
  }, [tab, range]);
  useEffect(() => { load(); }, [load]);

  async function undo(id: string) {
    if (!window.confirm("Reopen this completed route? Its fuel expense is cancelled.")) return;
    const r = await fetch("/api/route-plans/runs/" + id + "/undo", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setToast(j.error || "Could not reopen");
    setToast("Route reopened"); load();
  }

  const todo = (entries ?? []).filter((e) => e.status !== "completed");
  const over = todo.filter((e) => e.status === "overdue").length;
  const sum = (k: keyof Run) => (runs ?? []).reduce((x, r) => x + Number(r[k]), 0);
  const tile = (k: string, v: string, warn = false) => (<div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-lg font-bold " + (warn ? "text-red" : "")}>{v}</p></div>);
  const canDo = can("routes.manage") || can("visits.record");

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Route plans</h1></div>
        <div className="flex gap-2">
          <button className={"chip " + (tab === "planned" ? "chip-on" : "")} onClick={() => setTab("planned")}>Planned routes</button>
          <button className={"chip " + (tab === "completed" ? "chip-on" : "")} onClick={() => setTab("completed")}>Completed routes</button>
        </div>
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, label]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{label}</button>)}
        </div>
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        {tab === "planned" && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {tile("Routes still to do", String(todo.length))}{tile("Overdue", String(over), over > 0)}
              {tile("Customers to visit", String(todo.reduce((x, e) => x + e.planned, 0)))}{tile("Estimated fuel", rs(todo.reduce((x, e) => x + e.fuel_cost, 0)))}
            </div>
            {!entries && !error && <Loading />}
            {entries && !todo.length && <p className="text-sm text-muted">No planned routes in these dates, or all are completed. Routes follow their schedule in the Monthly planner.</p>}
            <ul className="grid gap-2 lg:grid-cols-2">
              {todo.map((e) => (
                <li key={e.key} className="card p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{e.name} {e.code && <span className="text-xs font-normal text-muted">{e.code}</span>}</p>
                      <p className="text-sm text-muted">{weekdayName(e.date)} {niceDate(e.date)}{e.date === today ? " · today" : ""} · {e.salesman || "no salesman"}</p>
                    </div>
                    {e.status === "overdue" ? <span className="pill bg-red-bg text-red">Overdue</span> : <span className="pill bg-amber-bg text-amber">Planned</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{FREQ_LABEL[e.frequency]} · {e.planned} customers · fuel {rs(e.fuel_cost)}{e.areas.length ? " · " + e.areas.slice(0, 4).join(", ") + (e.areas.length > 4 ? "…" : "") : ""}</p>
                  <div className="mt-2 flex gap-2">
                    <Link href={"/route-plans/" + e.route_id + "/" + e.date} className="btn min-h-9 flex-1">Open plan</Link>
                    {canDo && e.date <= today && <button className="btn btn-primary min-h-9 flex-1" onClick={() => setDone(e)}>Mark completed</button>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "completed" && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              {tile("Routes completed", String(runs?.length ?? 0))}{tile("Customers visited", String(sum("visited")))}{tile("Sales", rs(sum("sales")))}{tile("Collections", rs(sum("collections")))}{tile("Fuel cost", rs(sum("fuel")))}
            </div>
            {!runs && !error && <Loading />}
            {runs && !runs.length && <p className="text-sm text-muted">No completed routes in these dates.</p>}
            <ul className="grid gap-2 lg:grid-cols-2">
              {runs?.map((r) => (
                <li key={r.id} className="card p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><p className="font-semibold leading-snug">{r.route} {r.code && <span className="text-xs font-normal text-muted">{r.code}</span>}</p><p className="text-sm text-muted">{niceDate(r.date)} · {r.salesman || "no salesman"}</p></div>
                    <span className="pill bg-green-bg text-green">Completed</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">Visited</dt><dd className="font-semibold">{r.visited} / {r.planned}</dd></div>
                    <div><dt className="text-xs text-muted">Productive</dt><dd className="font-semibold">{r.productive}</dd></div>
                    <div><dt className="text-xs text-muted">Fuel</dt><dd className="font-semibold">{rs(r.fuel)}</dd></div>
                    <div><dt className="text-xs text-muted">Sales</dt><dd className="font-semibold">{rs(r.sales)}</dd></div>
                    <div><dt className="text-xs text-muted">Collected</dt><dd className="font-semibold">{rs(r.collections)}</dd></div>
                    <div><dt className="text-xs text-muted">Fuel / sales</dt><dd className="font-semibold">{r.sales > 0 ? (r.fuel / r.sales * 100).toFixed(1) + "%" : "—"}</dd></div>
                  </dl>
                  {r.note && <p className="mt-1 text-xs text-muted">{r.note}</p>}
                  <div className="mt-2 flex gap-2">
                    <Link href={"/route-plans/" + r.route_id + "/" + r.date} className="btn min-h-9 flex-1">Open plan</Link>
                    {can("routes.manage") && <button className="btn min-h-9 flex-1 text-red" onClick={() => undo(r.id)}>Reopen</button>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Fuel cost of each completed route is recorded in Expenses. Visited, sales and collections count what was recorded for that route on that date.</p>
          </>
        )}
      </div>

      {done && <CompleteModal routeId={done.route_id} name={done.name} date={done.date} fuel={done.fuel_cost} onClose={() => setDone(null)} onDone={() => { setDone(null); setToast("Route completed"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

export function CompleteModal({ routeId, name, date, fuel, onClose, onDone }: { routeId: string; name: string; date: string; fuel: number; onClose: () => void; onDone: () => void }) {
  const [cost, setCost] = useState(String(fuel || ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/route-plans/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route_id: routeId, date, fuel_cost: cost, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not complete the route");
    onDone();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Complete route" onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Complete {name}</h2><p className="mb-3 text-sm text-muted">{niceDate(date)}</p>
        <label className="label" htmlFor="cr-fuel">Fuel cost for this run (Rs)</label>
        <input id="cr-fuel" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" step="any" autoFocus value={cost} onChange={(e) => setCost(e.target.value)} />
        <p className="mt-1 text-xs text-muted">It is recorded in Expenses as Fuel.</p>
        <label className="label mt-3" htmlFor="cr-note">Note (optional)</label>
        <input id="cr-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Complete route"}</button></div>
      </div>
    </div>
  );
}
