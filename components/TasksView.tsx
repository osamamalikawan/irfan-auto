"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, niceDate, todayPk } from "@/lib/dates";
import { rs } from "@/lib/format";
import CollectModal from "./CollectModal";
import { Loading, LoadingBar, Spinner } from "./Loading";
import { useMe } from "./Me";
import NewPromiseModal from "./NewPromiseModal";
import Toast from "./Toast";

type Item = {
  id: string; kind: "order" | "promise" | "task"; date: string; title: string; sub: string; done: boolean;
  action?: "pack" | "deliver" | "complete"; sale_id?: string; sale_no?: string; sale_status?: string; customer_id?: string; amount?: number; status?: string; note?: string | null;
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DONE_LABEL = { pack: "Mark packed", deliver: "Mark delivered", complete: "Mark completed" } as const;
const KIND = {
  order: { label: "Orders", dot: "bg-accent", pill: "border border-accent text-accent" },
  promise: { label: "Promises", dot: "bg-amber", pill: "border border-amber bg-amber-bg text-amber" },
  task: { label: "Tasks", dot: "bg-green", pill: "bg-green-bg text-green" },
} as const;
const monthFirst = (iso: string) => iso.slice(0, 8) + "01";
const shiftMonth = (iso: string, n: number) => { const d = new Date(iso.slice(0, 8) + "01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7));

/** A month calendar of what is planned: orders scheduled for packing, delivery or completion, customer promises to pay, and your own tasks. */
export default function TasksView() {
  const { can } = useMe();
  const today = todayPk();
  const [month, setMonth] = useState(monthFirst(today));
  const [day, setDay] = useState(today);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [addTask, setAddTask] = useState(false);
  const [addPromise, setAddPromise] = useState(false);
  const [collect, setCollect] = useState<{ id: string; name: string } | null>(null);

  // the grid shows whole weeks, so it also shows the end of the last month and the start of the next
  const gridStart = mondayOf(month);
  const weeks = Math.ceil(((new Date(shiftMonth(month, 1) + "T12:00:00Z").getTime() - new Date(gridStart + "T12:00:00Z").getTime()) / 86400000) / 7);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/tasks?from=" + gridStart + "&to=" + gridEnd);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) return setError(j.error || "Could not load the calendar");
    setError(""); setItems(j.items);
  }, [gridStart, gridEnd]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items ?? []) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [items]);
  const dayItems = (byDay.get(day) ?? []).slice().sort((a, b) => Number(a.done) - Number(b.done) || a.kind.localeCompare(b.kind));
  const open = (items ?? []).filter((i) => !i.done);
  const overdue = open.filter((i) => i.date < today).length;
  const todays = open.filter((i) => i.date === today).length;

  async function call(key: string, url: string, method: string, body: object | undefined, msg: string) {
    setBusy(key);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return setToast(j.error || "Could not save");
    setToast(msg); load();
  }

  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  return (
    <div>
      <header className="border-b border-line bg-bg px-3 pb-2 pt-3 lg:border-0 lg:px-5 lg:pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><h1 className="text-lg font-bold lg:text-xl">Tasks</h1>
            <p className="text-xs text-muted">{todays} due today{overdue > 0 ? " · " : ""}{overdue > 0 && <span className="font-semibold text-red">{overdue} overdue</span>}</p></div>
          <button className="btn" onClick={() => setAddPromise(true)}>＋ Promise</button>
          <button className="btn btn-primary" onClick={() => setAddTask(true)}>＋ Task</button>
        </div>
        <LoadingBar active={loading} className="mt-2" />
      </header>
      {error && <p role="alert" className="m-3 rounded-lg bg-red-bg p-2 text-sm text-red lg:mx-5">{error}</p>}

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)] lg:items-start lg:px-5">
        <section className="card p-3">
          <div className="mb-2 flex items-center gap-2">
            <button className="btn min-h-9 px-3" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
            <h2 className="flex-1 text-center font-semibold">{new Date(month + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
            <button className="btn min-h-9 px-3" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
            <button className="btn min-h-9 px-3" onClick={() => { setMonth(monthFirst(today)); setDay(today); }}>Today</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
            {cells.map((d) => {
              const list = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              const late = d < today && list.some((i) => !i.done);
              const counts = (["order", "promise", "task"] as const).map((k) => [k, list.filter((i) => i.kind === k && !i.done).length] as const).filter(([, n]) => n > 0);
              return (
                <button key={d} type="button" role="gridcell" aria-selected={d === day} aria-label={niceDate(d) + ", " + list.length + " items"} onClick={() => setDay(d)}
                  className={"flex min-h-[4.5rem] flex-col rounded-lg border p-1 text-left active:opacity-70 " + (d === day ? "border-accent ring-2 ring-accent " : "border-line ") + (inMonth ? "bg-surface " : "bg-bg opacity-60 ") + (d === today ? "font-bold " : "")}>
                  <span className={"text-xs " + (d === today ? "text-accent" : "")}>{Number(d.slice(8))}{late && <span className="ml-1 text-red" title="Overdue">●</span>}</span>
                  <span className="mt-auto flex flex-wrap gap-0.5">
                    {counts.map(([k, n]) => <span key={k} className="inline-flex items-center gap-0.5 rounded-full bg-bg px-1 text-[10px] font-semibold"><span className={"size-1.5 rounded-full " + KIND[k].dot} />{n}</span>)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">{(["order", "promise", "task"] as const).map((k) => <span key={k} className="flex items-center gap-1"><span className={"size-2 rounded-full " + KIND[k].dot} />{KIND[k].label}</span>)}</div>
        </section>

        <section className="card p-3">
          <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 font-semibold">{day === today ? "Today · " : ""}{niceDate(day)}</h2>
            <button className="btn min-h-9 px-3" onClick={() => setAddTask(true)}>＋ Add</button></div>
          {!items && !error && <Loading />}
          {items && !dayItems.length && <p className="py-4 text-center text-sm text-muted">Nothing planned for this day.</p>}
          <ul className="divide-y divide-line">
            {dayItems.map((i) => (
              <li key={i.kind + i.id} className={"py-3 " + (i.done ? "opacity-60" : "")}>
                <div className="flex items-start gap-2">
                  <span className={"pill shrink-0 " + KIND[i.kind].pill}>{i.kind === "order" ? "Order" : i.kind === "promise" ? "Promise" : "Task"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={"font-medium leading-snug " + (i.done ? "line-through" : "")}>{i.title}</p>
                    <p className="text-sm text-muted">{i.sub}{i.kind === "order" && i.amount ? " · " + rs(i.amount) : ""}</p>
                    {i.note && <p className="text-xs text-muted">{i.note}</p>}
                  </div>
                  {i.done && <span className="pill bg-green-bg text-green">Done</span>}
                  {!i.done && i.date < today && <span className="pill bg-red-bg text-red">Overdue</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {i.kind === "order" && i.sale_id && <Link className="btn min-h-8 px-2.5 text-[13px]" href={"/sales/" + i.sale_id}>Open invoice</Link>}
                  {i.kind === "order" && !i.done && can("sales.status") && <button className="btn btn-primary min-h-8 px-2.5 text-[13px]" disabled={busy === i.id} onClick={() => call(i.id, "/api/sale-tasks/" + i.id, "PATCH", { done: true }, i.sale_no + " updated")}>{busy === i.id ? <Spinner /> : DONE_LABEL[i.action!]}</button>}
                  {i.kind === "order" && can("sales.status") && <button className="btn min-h-8 px-2.5 text-[13px] text-red" disabled={busy === i.id} onClick={() => call(i.id, "/api/sale-tasks/" + i.id, "DELETE", undefined, "Removed")}>Remove</button>}
                  {i.kind === "promise" && i.customer_id && <Link className="btn min-h-8 px-2.5 text-[13px]" href={"/customers/" + i.customer_id}>Customer</Link>}
                  {i.kind === "promise" && !i.done && i.customer_id && can("payments.receive") && <button className="btn btn-primary min-h-8 px-2.5 text-[13px]" onClick={() => setCollect({ id: i.customer_id!, name: i.sub })}>Receive payment</button>}
                  {i.kind === "task" && <button className="btn min-h-8 px-2.5 text-[13px]" disabled={busy === i.id} onClick={() => call(i.id, "/api/tasks/" + i.id, "PATCH", { done: !i.done }, i.done ? "Reopened" : "Done")}>{i.done ? "Reopen" : "Mark done"}</button>}
                  {i.kind === "task" && <button className="btn min-h-8 px-2.5 text-[13px] text-red" disabled={busy === i.id} onClick={() => call(i.id, "/api/tasks/" + i.id, "DELETE", undefined, "Removed")}>Delete</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {addTask && <TaskModal date={day} onClose={() => setAddTask(false)} onSaved={() => { setAddTask(false); setToast("Task added"); load(); }} />}
      {addPromise && <NewPromiseModal presetDate={day} onClose={() => setAddPromise(false)} onSaved={(m) => { setAddPromise(false); setToast(m); load(); }} />}
      {collect && <CollectModal customer={collect} onClose={() => setCollect(null)} onDone={(m) => { setCollect(null); setToast(m); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}

function TaskModal({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(date);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, due_date: due, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Could not save");
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label="Add task" onSubmit={save} onClick={(e) => e.stopPropagation()} className="grid w-full max-w-md grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h2 className="col-span-2 text-base font-semibold">Add a task</h2>
        <div className="col-span-2"><label className="label" htmlFor="tk-title">What has to be done?</label><input id="tk-title" className="input" autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
        <div><label className="label" htmlFor="tk-date">Date</label><input id="tk-date" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} required /></div>
        <div><label className="label" htmlFor="tk-note">Note (optional)</label><input id="tk-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <p role="alert" className="col-span-2 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? <><Spinner /> Saving…</> : "Add task"}</button></div>
      </form>
    </div>
  );
}
