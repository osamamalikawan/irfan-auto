"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, niceDate, todayPk, weekStart } from "@/lib/dates";
import { duration, fmtTime, mapLink } from "@/lib/field-ui";
import { Loading } from "./Loading";
import { useMe } from "./Me";

type Row = {
  id: string; user_id: string; user_name: string; work_date: string; check_in_at: string; in_lat: number; in_lng: number; in_accuracy: number | null;
  check_out_at: string | null; out_lat: number | null; out_lng: number | null; out_accuracy: number | null;
};
type Man = { id: string; name: string };
const RANGES = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["custom", "Custom"]] as const;

export default function AttendanceView() {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("today");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [men, setMen] = useState<Man[]>([]);
  const [error, setError] = useState("");
  const today = todayPk();
  const [from, to] = useMemo(() => {
    if (range === "today") return [today, today];
    if (range === "yesterday") { const y = addDays(today, -1); return [y, y]; }
    if (range === "week") return [weekStart(today), today];
    const f = cFrom || today; return [f, cTo && cTo >= f ? cTo : f];
  }, [range, cFrom, cTo, today]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRows(null);
    try {
      const r = await fetch("/api/attendance?from=" + from + "&to=" + to);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load attendance");
      setRows(j.items ?? []); setMen(j.salesmen ?? []); setError("");
    } catch (e) { setError((e as Error).message); setRows((x) => x ?? []); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (to !== today) return; const t = setInterval(() => { if (!document.hidden) load(true); }, 60000); return () => clearInterval(t); }, [to, today, load]);

  const single = from === to;
  const absent = single ? men.filter((m) => !(rows ?? []).some((r) => r.user_id === m.id)) : [];
  const onDuty = (rows ?? []).filter((r) => !r.check_out_at && r.work_date === today).length;
  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) m.set(r.work_date, [...(m.get(r.work_date) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const tile = (k: string, v: number, warn = false) => <div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-xl font-bold " + (warn && v > 0 ? "text-red" : "")}>{v}</p></div>;

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Attendance</h1>
        <p className="mb-2 text-sm text-muted">When and where each salesman started and finished work.</p>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {RANGES.map(([k, l]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{l}</button>)}
          <button className="chip ml-auto" onClick={() => load()} aria-label="Refresh">↻ Refresh</button>
        </div>
        {range === "custom" && (
          <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
            <div><label className="label" htmlFor="at-from">From</label><input id="at-from" className="input" type="date" max={today} value={cFrom || from} onChange={(e) => setCFrom(e.target.value)} /></div>
            <div><label className="label" htmlFor="at-to">To</label><input id="at-to" className="input" type="date" max={today} value={cTo || to} onChange={(e) => setCTo(e.target.value)} /></div>
          </div>
        )}
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {rows === null && <Loading />}
        {rows && (
          <>
            <div className="grid grid-cols-3 gap-2 lg:max-w-lg">
              {tile(single ? "Present" : "Check-ins", rows.length)}
              {to === today ? tile("On duty now", onDuty) : tile("Finished", rows.filter((r) => r.check_out_at).length)}
              {single ? tile(from === today ? "Not started" : "Absent", absent.length, true) : tile("Salesmen", new Set(rows.map((r) => r.user_id)).size)}
            </div>
            {!rows.length && !error && <p className="card p-4 text-sm text-muted">No attendance recorded for {single ? niceDate(from) : niceDate(from) + " to " + niceDate(to)}.</p>}
            {byDate.map(([d, list]) => (
              <section key={d}>
                {!single && <h2 className="mb-1 mt-2 text-sm font-semibold text-muted">{niceDate(d)}</h2>}
                <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {list.map((r) => {
                    const live = !r.check_out_at && r.work_date === today;
                    return (
                      <li key={r.id} className="card p-3">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-semibold">{r.user_name}</p>
                          <span className={"pill " + (live ? "bg-green-bg text-green" : r.check_out_at ? "bg-bg text-ink" : "bg-amber-bg text-amber")}>{live ? "On duty" : r.check_out_at ? "Finished" : "No check-out"}</span>
                        </div>
                        <p className="mt-1 text-sm">Started <b>{fmtTime(r.check_in_at)}</b> · <a className="underline" href={mapLink(r.in_lat, r.in_lng)} target="_blank" rel="noreferrer">place</a>{r.in_accuracy != null && <span className="text-xs text-muted"> (±{Math.round(r.in_accuracy)} m)</span>}</p>
                        {r.check_out_at && r.out_lat != null && r.out_lng != null && <p className="text-sm">Finished <b>{fmtTime(r.check_out_at)}</b> · <a className="underline" href={mapLink(r.out_lat, r.out_lng)} target="_blank" rel="noreferrer">place</a>{r.out_accuracy != null && <span className="text-xs text-muted"> (±{Math.round(r.out_accuracy)} m)</span>}</p>}
                        <p className="mt-1 text-xs text-muted">{r.check_out_at ? "Worked " + duration(r.check_in_at, r.check_out_at) : live ? "On duty for " + duration(r.check_in_at) : "Never checked out"}</p>
                        {can("tracking.view") && <Link className="mt-1 inline-block text-sm underline" href={"/tracking?user=" + r.user_id + "&date=" + r.work_date}>See the route on the map</Link>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {absent.length > 0 && (
              <section>
                <h2 className="mb-1 mt-2 text-sm font-semibold text-muted">{from === today ? "Not started yet" : "No attendance"}</h2>
                <ul className="flex flex-wrap gap-2">{absent.map((m) => <li key={m.id} className="pill bg-red-bg text-red">{m.name}</li>)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
