"use client";
import { useState } from "react";
import { todayPk } from "@/lib/dates";
import type { Emp } from "./EmployeesList";
import { Spinner } from "./Loading";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Add or edit an employee: details, salary (daily, weekly or monthly) and, when editing, working / left. */
export default function EmployeeForm({ initial, onClose, onSaved }: { initial?: Emp; onClose: () => void; onSaved: () => void }) {
  const edit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [cnic, setCnic] = useState(initial?.cnic ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [joinDate, setJoinDate] = useState(initial?.join_date ?? todayPk());
  const [type, setType] = useState<"daily" | "weekly" | "monthly">(initial?.salary_type ?? "monthly");
  const [amount, setAmount] = useState(initial ? String(initial.salary_amount) : "");
  const [off, setOff] = useState<string>(initial?.weekly_off != null ? String(initial.weekly_off) : "");
  const [opening, setOpening] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<"active" | "left">(initial?.status ?? "active");
  const [leaveDate, setLeaveDate] = useState(initial?.leave_date ?? todayPk());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      const body: Record<string, unknown> = {
        name, phone, cnic, address, designation, join_date: joinDate, salary_type: type, salary_amount: Number(amount) || 0, weekly_off: type === "daily" && off !== "" ? Number(off) : null, notes,
      };
      if (edit) { body.status = status; if (status === "left") body.leave_date = leaveDate; }
      else if (opening.trim() !== "") body.opening_balance = Number(opening);
      const r = await fetch(edit ? "/api/employees/" + initial!.id : "/api/employees", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error || "Could not save");
      onSaved();
    } catch { setError("No connection. Try again."); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label={edit ? "Edit employee" : "Add employee"} onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[94dvh] w-full max-w-lg overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2"><h2 className="flex-1 text-base font-semibold">{edit ? "Edit " + initial!.name : "Add employee"}</h2><button className="btn min-h-9" onClick={onClose}>Close</button></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className="label" htmlFor="e-name">Name</label><input id="e-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <div><label className="label" htmlFor="e-phone">Phone</label><input id="e-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label" htmlFor="e-cnic">CNIC</label><input id="e-cnic" className="input" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="00000-0000000-0" /></div>
          <div><label className="label" htmlFor="e-des">Designation</label><input id="e-des" className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Salesman, driver, helper…" /></div>
          <div><label className="label" htmlFor="e-join">Joined on</label><input id="e-join" className="input" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} /></div>
          <div className="col-span-2"><label className="label" htmlFor="e-addr">Address</label><input id="e-addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>

          <div className="col-span-2 mt-2 rounded-xl bg-bg p-3">
            <p className="label">Salary is paid</p>
            <div role="radiogroup" aria-label="Salary type" className="mb-2 flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={type === t} className={"chip " + (type === t ? "chip-on" : "")} onClick={() => setType(t)}>{t === "daily" ? "Daily" : t === "weekly" ? "Weekly" : "Monthly"}</button>)}
            </div>
            <label className="label" htmlFor="e-amt">Rs per {type === "daily" ? "day" : type === "weekly" ? "week" : "month"}</label>
            <input id="e-amt" className="input" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {type === "daily" && (
              <div className="mt-2"><label className="label" htmlFor="e-off">Weekly off (no wage on this day)</label>
                <select id="e-off" className="input" value={off} onChange={(e) => setOff(e.target.value)}><option value="">None: every day is paid</option>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
            )}
            <p className="mt-2 text-xs text-muted">Salary is posted to the ledger when each {type === "daily" ? "day" : type === "weekly" ? "week" : "month"} ends. A part period (joined or left in the middle) is paid in proportion.</p>
          </div>

          {!edit && <div className="col-span-2"><label className="label" htmlFor="e-open">Opening balance (optional): Rs the shop already owes him, or a minus number for an advance he has taken</label><input id="e-open" className="input" type="number" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>}
          <div className="col-span-2"><label className="label" htmlFor="e-notes">Notes</label><input id="e-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></div>
          {edit && (
            <div className="col-span-2 rounded-xl bg-bg p-3">
              <p className="label">Status</p>
              <div role="radiogroup" aria-label="Status" className="flex gap-2">
                <button type="button" role="radio" aria-checked={status === "active"} className={"chip " + (status === "active" ? "chip-on" : "")} onClick={() => setStatus("active")}>Working</button>
                <button type="button" role="radio" aria-checked={status === "left"} className={"chip " + (status === "left" ? "chip-on" : "")} onClick={() => setStatus("left")}>Left</button>
              </div>
              {status === "left" && <div className="mt-2"><label className="label" htmlFor="e-leave">Last working day</label><input id="e-leave" className="input" type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} /></div>}
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <button className="btn btn-primary mt-3 w-full" disabled={busy || !name.trim()} onClick={save}>{busy ? <><Spinner /> Saving…</> : edit ? "Save changes" : "Add employee"}</button>
      </div>
    </div>
  );
}
