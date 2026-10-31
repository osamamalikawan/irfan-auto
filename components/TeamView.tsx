"use client";
import { useCallback, useEffect, useState } from "react";
import type { Metric } from "@/lib/targets";
import { niceDate } from "@/lib/dates";
import MetricBar from "./MetricBar";
import { useMe } from "./Me";
import Toast from "./Toast";

type Row = { id: string; name: string; sub: string; sales: Metric; collection: Metric; visits: Metric; monthly: { sales: number; collection: number; visits: number } };
type Data = { from: string; to: string; days: number; group: string; thresholds: { red: number; green: number }; rows: Row[] };
const RANGES = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"]] as const;
const GROUPS = [["salesman", "Salesman"], ["route", "Route"], ["area", "Area"]] as const;
const behind = (m: Metric) => m.status === "red" || m.status === "amber";

export default function TeamView() {
  const { can } = useMe();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("month");
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>("salesman");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams({ range, group });
    if (range === "custom") { if (from) p.set("from", from); if (to) p.set("to", to); }
    const r = await fetch("/api/team?" + p);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load the team figures");
    setError(""); setD(j);
  }, [range, group, from, to]);
  useEffect(() => { load(); }, [load]);

  const rows = d?.rows ?? [];
  const lowS = rows.filter((r) => behind(r.sales)).length, lowC = rows.filter((r) => behind(r.collection)).length;
  const both = rows.filter((r) => r.sales.status === "green" && r.collection.status === "green").length;
  const canEdit = can("targets.manage") && group !== "area";
  const flag = (r: Row) => r.sales.status === "green" && behind(r.collection) ? <span className="pill bg-red-bg text-red">▼ Sales met, collections behind</span>
    : behind(r.sales) && r.collection.status === "green" ? <span className="pill bg-amber-bg text-amber">◐ Collections met, sales behind</span> : null;
  const tile = (k: string, v: number, warn = false) => (<div key={k} className="card p-3"><p className="text-xs text-muted">{k}</p><p className={"text-xl font-bold " + (warn && v > 0 ? "text-red" : "")}>{v}</p></div>);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <div className="mb-2 lg:hidden"><h1 className="text-lg font-bold">Sales Team</h1></div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
          {GROUPS.map(([k, l]) => <button key={k} className={"chip " + (group === k ? "chip-on" : "")} onClick={() => setGroup(k)}>{l}</button>)}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {RANGES.map(([k, l]) => <button key={k} className={"chip " + (range === k ? "chip-on" : "")} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        {range === "custom" && (
          <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
            <div><label className="label" htmlFor="tm-from">From</label><input id="tm-from" className="input" type="date" value={from || d?.from || ""} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label" htmlFor="tm-to">To</label><input id="tm-to" className="input" type="date" value={to || d?.to || ""} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {d && <p className="text-sm text-muted">{niceDate(d.from)} to {niceDate(d.to)} ({d.days} day{d.days === 1 ? "" : "s"}). Monthly targets are pro-rated by days. Sales are net of returns; collections are payments actually received. Green from {d.thresholds.green}%, red below {d.thresholds.red}%.</p>}
        {!d && !error && <p className="text-sm text-muted">Loading…</p>}
        {d && (
          <>
            <div className="grid grid-cols-3 gap-2">{tile("Below sales target", lowS, true)}{tile("Below collection target", lowC, true)}{tile("Meeting both", both)}</div>
            {!rows.length && <p className="text-sm text-muted">{group === "salesman" ? "No salesmen yet. Mark a user as a salesman in Users & Roles." : "Nothing to show."}</p>}
            <ul className="grid gap-2 lg:grid-cols-2">
              {rows.map((r) => (
                <li key={r.id} className="card p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><p className="font-semibold leading-snug">{r.name} {r.sub && <span className="text-xs font-normal text-muted">{r.sub}</span>}</p><div className="mt-1">{flag(r)}</div></div>
                    {canEdit && <button className="btn min-h-9 px-3" onClick={() => setEdit(r)}>Targets</button>}
                  </div>
                  <div className="mt-3 space-y-3">
                    <MetricBar label="Sales" m={r.sales} />
                    <MetricBar label="Collections" m={r.collection} />
                    <MetricBar label="Visits" m={r.visits} money={false} />
                  </div>
                </li>
              ))}
            </ul>
            {group === "area" && <p className="text-xs text-muted">Area targets are worked out from the routes that cover the area (a route&apos;s target is shared between its areas).</p>}
          </>
        )}
      </div>
      {edit && <TargetsModal row={edit} kind={group === "route" ? "route" : "salesman"} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setToast("Targets saved"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function TargetsModal({ row, kind, onClose, onSaved }: { row: Row; kind: "salesman" | "route"; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(row.monthly.sales ? String(row.monthly.sales) : "");
  const [c, setC] = useState(row.monthly.collection ? String(row.monthly.collection) : "");
  const [v, setV] = useState(row.monthly.visits ? String(row.monthly.visits) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/team/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: row.id, sales: s, collection: c, visits: v }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Targets"
        className="mx-auto w-full max-w-2xl rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-md lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <h2 className="text-base font-semibold">Monthly targets: {row.name}</h2><p className="mb-3 text-sm text-muted">Leave a target empty or 0 for no target.</p>
        <div className="space-y-3">
          <div><label className="label" htmlFor="tg-s">Sales per month (Rs)</label><input id="tg-s" className="input" type="number" inputMode="decimal" min="0" autoFocus value={s} onChange={(e) => setS(e.target.value)} /></div>
          <div><label className="label" htmlFor="tg-c">Collections per month (Rs)</label><input id="tg-c" className="input" type="number" inputMode="decimal" min="0" value={c} onChange={(e) => setC(e.target.value)} /></div>
          <div><label className="label" htmlFor="tg-v">Visits per month</label><input id="tg-v" className="input" type="number" inputMode="numeric" min="0" value={v} onChange={(e) => setV(e.target.value)} /></div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:flex lg:justify-end"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save targets"}</button></div>
      </form>
    </div>
  );
}
