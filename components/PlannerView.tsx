"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate, todayPk } from "@/lib/dates";
import { DAYS } from "@/lib/days";
import { FREQ_LABEL, MONTH_WEEKS, VISIT_OUTCOMES, describeSchedule, isVisitDate, monthDates, monthGrid, monthLabel, shiftMonth, weekdayName, type Freq, type Sched } from "@/lib/schedule";
import { useMe } from "./Me";
import Toast from "./Toast";
import { Loading, Spinner } from "./Loading";

type PRoute = Sched & { id: string; name: string; code: string | null; salesman: { id: string; name: string } | null; customers: number };
type Coverage = { areasNoRoute: { id: string; name: string; city: string; customers: number }[]; customersNoRoute: { total: number; sample: { id: string; name: string }[] } } | null;
type DayRoute = { id: string; name: string; code: string | null; frequency: Freq; salesman: { id: string; name: string } | null; customers: { id: string; name: string; phone: string | null; owner: string | null; area: string; outcome: string | null }[] };

const DOT: Record<Freq, string> = { weekly: "bg-green", fortnightly: "bg-amber", monthly: "bg-accent" };
const CHIP: Record<Freq, string> = { weekly: "bg-green-bg text-green", fortnightly: "bg-amber-bg text-amber", monthly: "bg-bg text-ink" };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PlannerView() {
  const { can } = useMe();
  const today = todayPk();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [routes, setRoutes] = useState<PRoute[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage>(null);
  const [day, setDay] = useState<DayRoute[] | null>(null);
  const [error, setError] = useState("");
  const [visit, setVisit] = useState<{ id: string; name: string } | null>(null);
  const [edit, setEdit] = useState<PRoute | null>(null);
  const [toast, setToast] = useState("");
  const canEdit = can("planner.edit") || can("routes.manage");

  const loadPlan = useCallback(async () => {
    const r = await fetch("/api/planner");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the planner");
    setError(""); setRoutes(j.routes); setCoverage(j.coverage);
  }, []);
  const loadDay = useCallback(async () => {
    setDay(null);
    const r = await fetch("/api/planner/day?date=" + sel);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the day");
    setDay(j.routes);
  }, [sel]);
  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => { loadDay(); }, [loadDay]);

  const grid = monthGrid(ym);
  const on = (date: string) => (routes ?? []).filter((r) => isVisitDate(r, date));
  const total = (day ?? []).reduce((x, r) => x + r.customers.length, 0), done = (day ?? []).reduce((x, r) => x + r.customers.filter((c) => c.outcome).length, 0);

  const problems = routes ? {
    noSalesman: routes.filter((r) => !r.salesman), noDays: routes.filter((r) => !r.visit_days.length),
  } : null;
  const issueCount = problems ? problems.noSalesman.length + problems.noDays.length + (coverage ? coverage.areasNoRoute.length + (coverage.customersNoRoute.total ? 1 : 0) : 0) : 0;

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Monthly planner</h1></div>
        <div className="flex items-center gap-2">
          <button className="btn size-11 px-0" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month">‹</button>
          <p className="min-w-40 flex-1 text-center text-base font-semibold lg:flex-none">{monthLabel(ym)}</p>
          <button className="btn size-11 px-0" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month">›</button>
          <button className="btn" onClick={() => { setYm(today.slice(0, 7)); setSel(today); }}>Today</button>
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {(["weekly", "fortnightly", "monthly"] as Freq[]).map((f) => <span key={f} className="flex items-center gap-1"><span className={"size-2.5 rounded-full " + DOT[f]} />{FREQ_LABEL[f]}</span>)}
        </p>
      </header>

      <div className="space-y-3 p-3 lg:grid lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-4 lg:space-y-0 lg:px-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red lg:col-span-2">{error}</p>}

        <section className="card p-2 lg:p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">{WEEK.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map(({ date, inMonth }) => {
              const rs = on(date), isSel = sel === date, isToday = date === today;
              return (
                <button key={date} onClick={() => { setSel(date); if (!inMonth) setYm(date.slice(0, 7)); }} aria-label={niceDate(date) + ", " + rs.length + " routes"} aria-pressed={isSel}
                  className={"min-h-14 rounded-lg border p-1 text-left align-top lg:min-h-24 " + (isSel ? "border-2 border-accent " : "border-line ") + (inMonth ? "bg-surface" : "bg-bg opacity-60")}>
                  <span className={"text-xs lg:text-sm " + (isToday ? "rounded bg-accent px-1 font-bold text-accent-ink" : "font-medium")}>{+date.slice(8, 10)}</span>
                  <span className="mt-1 flex flex-wrap gap-0.5 lg:hidden">{rs.slice(0, 6).map((r) => <span key={r.id} className={"size-2 rounded-full " + DOT[r.frequency]} />)}</span>
                  <span className="mt-1 hidden space-y-0.5 lg:block">
                    {rs.slice(0, 3).map((r) => <span key={r.id} className={"block truncate rounded px-1 text-[11px] " + CHIP[r.frequency]}>{r.code || r.name}</span>)}
                    {rs.length > 3 && <span className="block text-[11px] text-muted">+{rs.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">{weekdayName(sel)} {niceDate(sel)}{sel === today ? " · today" : ""}</h2>
          {day && <p className="mb-2 text-sm text-muted">{day.length ? day.length + " route" + (day.length === 1 ? "" : "s") + " · " + done + " of " + total + " customers visited" : "No route is planned for this day."}</p>}
          {!day && !error && <Loading />}
          {sel > today && day && day.length > 0 && <p className="mb-2 rounded-lg bg-bg p-2 text-xs text-muted">This day is in the future. Visits can be recorded on the day itself.</p>}
          <div className="space-y-4">
            {day?.map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-2"><p className="font-semibold">{r.name}</p><span className={"pill " + CHIP[r.frequency]}>{FREQ_LABEL[r.frequency]}</span></div>
                <p className="text-xs text-muted">{r.salesman ? r.salesman.name : "No salesman"} · {r.customers.length} customers · <Link href={"/route-plans/" + r.id + "/" + sel} className="underline">Open route plan</Link></p>
                <ul className="mt-1 divide-y divide-line">
                  {r.customers.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1"><Link href={"/customers/" + c.id} className="block truncate text-sm font-medium hover:underline">{c.name}</Link><p className="truncate text-xs text-muted">{[c.area, c.owner].filter(Boolean).join(" · ")}</p></div>
                      {c.outcome ? <span className="pill bg-green-bg text-green">{c.outcome}</span>
                        : can("visits.record") && sel === today ? <button className="btn min-h-9 px-3 text-sm" onClick={() => setVisit({ id: c.id, name: c.name })}>Record visit</button>
                        : <span className="pill bg-bg text-muted">{sel < today ? "Not visited" : "Planned"}</span>}
                    </li>
                  ))}
                </ul>
                {!r.customers.length && <p className="text-sm text-muted">No customers on this route yet.</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 font-semibold">Route schedules</h2>{can("routes.manage") && <Link href="/routes" className="btn min-h-9 px-3">Manage routes</Link>}</div>
          {!routes && !error && <Loading />}
          {routes && !routes.length && <p className="text-sm text-muted">No routes yet. Add routes in Routes &amp; Areas.</p>}
          <ul className="grid gap-2 lg:grid-cols-2">
            {routes?.map((r) => {
              const dates = monthDates(r, ym);
              return (
                <li key={r.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{r.name} <span className={"ml-1 pill " + CHIP[r.frequency]}>{FREQ_LABEL[r.frequency]}</span></p>
                      <p className="text-sm text-muted">{describeSchedule(r)}</p>
                      <p className="text-xs text-muted">{r.salesman ? r.salesman.name : "No salesman"} · {r.customers} customers</p>
                      <p className="mt-1 text-xs">{dates.length ? "In " + monthLabel(ym).split(" ")[0] + ": " + dates.map((d) => +d.slice(8, 10)).join(", ") : "No visits this month"}</p>
                    </div>
                    {canEdit && <button className="btn min-h-9 px-3" onClick={() => setEdit(r)}>Edit</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {problems && (
          <section className="card p-4 lg:col-span-2">
            <h2 className="mb-2 font-semibold">What the plan does not cover</h2>
            {issueCount === 0 && <p className="rounded-lg bg-green-bg p-2 text-sm text-green">Every route has a salesman and visit days{coverage ? ", every area is on a route and every customer has a route" : ""}.</p>}
            <ul className="space-y-2 text-sm">
              {problems.noSalesman.length > 0 && <li><b className="text-red">Routes without a salesman:</b> {problems.noSalesman.map((r) => r.name).join(", ")}</li>}
              {problems.noDays.length > 0 && <li><b className="text-red">Routes without visit days:</b> {problems.noDays.map((r) => r.name).join(", ")}</li>}
              {coverage && coverage.areasNoRoute.length > 0 && <li><b className="text-amber">Areas not on any route:</b> {coverage.areasNoRoute.map((a) => a.name + (a.city ? " (" + a.city + ")" : "") + (a.customers ? " · " + a.customers + " customers" : "")).join(", ")}</li>}
              {coverage && coverage.customersNoRoute.total > 0 && <li><b className="text-amber">{coverage.customersNoRoute.total} customers have no route:</b> {coverage.customersNoRoute.sample.map((c) => c.name).join(", ")}{coverage.customersNoRoute.total > coverage.customersNoRoute.sample.length ? " …" : ""} <Link href="/customers" className="underline">Open customers</Link></li>}
            </ul>
          </section>
        )}
      </div>

      {visit && <VisitModal customer={visit} onClose={() => setVisit(null)} onDone={() => { setVisit(null); setToast("Visit recorded"); loadDay(); }} />}
      {edit && <ScheduleModal route={edit} ym={ym} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setToast("Schedule saved"); loadPlan(); loadDay(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

const overlay = "fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center";
const panel = "mx-auto max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4";

function VisitModal({ customer, onClose, onDone }: { customer: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState<string>(VISIT_OUTCOMES[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customer.id, outcome, notes }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save the visit");
    onDone();
  }
  return (
    <div className={overlay} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Record visit" className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Record visit</h2><p className="mb-3 text-sm text-muted">{customer.name}</p>
        <label className="label" htmlFor="vs-out">What happened?</label>
        <select id="vs-out" className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{VISIT_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select>
        <label className="label mt-3" htmlFor="vs-notes">Notes (optional)</label>
        <textarea id="vs-notes" className="input min-h-16 py-2" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? <><Spinner /> Saving…</> : "Save visit"}</button></div>
      </form>
    </div>
  );
}

function ScheduleModal({ route, ym, onClose, onSaved }: { route: PRoute; ym: string; onClose: () => void; onSaved: () => void }) {
  const [freq, setFreq] = useState<Freq>(route.frequency);
  const [days, setDays] = useState<string[]>(route.visit_days);
  const [cycle, setCycle] = useState(route.cycle_start ?? todayPk());
  const [mw, setMw] = useState(route.month_week ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dates = monthDates({ frequency: freq, visit_days: days, cycle_start: freq === "fortnightly" ? cycle : null, month_week: freq === "monthly" ? mw : null }, ym);

  async function save() {
    setBusy(true); setError("");
    const r = await fetch("/api/planner/routes/" + route.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frequency: freq, visit_days: days, cycle_start: cycle, month_week: mw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onSaved();
  }
  return (
    <div className={overlay} onClick={onClose}>
      <div role="dialog" aria-label="Edit schedule" onClick={(e) => e.stopPropagation()} className={panel}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Schedule: {route.name}</h2>
        <p className="mb-3 text-sm text-muted">How often is this route visited?</p>
        <div className="flex flex-wrap gap-2">
          {(["weekly", "fortnightly", "monthly"] as Freq[]).map((f) => <button key={f} className={"chip " + (freq === f ? "chip-on" : "")} aria-pressed={freq === f} onClick={() => setFreq(f)}>{FREQ_LABEL[f]}</button>)}
        </div>
        <p className="mt-1 text-xs text-muted">{freq === "weekly" ? "Every week on the days below." : freq === "fortnightly" ? "Every second week, on the days below." : "Once a month: the chosen week of the month, on the days below."}</p>
        <fieldset className="mt-3"><legend className="label">Visit days</legend>
          <div className="flex flex-wrap gap-2">{DAYS.map((d) => <button key={d} className={"chip " + (days.includes(d) ? "chip-on" : "")} aria-pressed={days.includes(d)} onClick={() => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}>{d}</button>)}</div>
        </fieldset>
        {freq === "fortnightly" && (
          <div className="mt-3"><label className="label" htmlFor="sc-cycle">A date in the first visit week</label><input id="sc-cycle" className="input" type="date" value={cycle} onChange={(e) => setCycle(e.target.value)} />
            <p className="mt-1 text-xs text-muted">The route is visited in this week, then every second week after it.</p></div>
        )}
        {freq === "monthly" && (
          <div className="mt-3"><label className="label" htmlFor="sc-mw">Which week of the month</label>
            <select id="sc-mw" className="input" value={mw} onChange={(e) => setMw(Number(e.target.value))}>{MONTH_WEEKS.map(([n, l]) => <option key={n} value={n}>{l} {days.length ? days.join(" / ") : "visit day"} of the month</option>)}</select></div>
        )}
        <p className="mt-3 rounded-lg bg-bg p-2 text-sm">{days.length ? (dates.length ? monthLabel(ym).split(" ")[0] + " visits: " + dates.map((d) => weekdayName(d) + " " + +d.slice(8, 10)).join(", ") : "No visits in " + monthLabel(ym) + ".") : "Choose at least one visit day."}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || (freq === "fortnightly" && !cycle)} onClick={save}>{busy ? <><Spinner /> Saving…</> : "Save schedule"}</button></div>
      </div>
    </div>
  );
}
