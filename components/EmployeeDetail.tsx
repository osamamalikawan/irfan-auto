"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";
import { AdjustModal, LoginModal, PayModal } from "./EmployeeModals";
import EmployeeForm from "./EmployeeForm";
import { PER, type Emp } from "./EmployeesList";
import { Loading, Spinner } from "./Loading";
import { useMe } from "./Me";
import Toast from "./Toast";

type Line = { id: string; date: string; type: string; label: string; voided: boolean; debit: number; credit: number; balance: number };
type Data = { employee: Emp; opening: number; closing: number; balance: number; rows: Line[]; totalDebit: number; totalCredit: number };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function EmployeeDetail({ id }: { id: string }) {
  const { can } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<null | "payment" | "advance" | "bonus" | "deduction" | "opening" | "edit" | "login">(null);
  const [toast, setToast] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/employees/" + id + "?from=" + from + "&to=" + to);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the employee");
      setData(j); setError("");
    } catch (e) { setError((e as Error).message); }
  }, [id, from, to]);
  useEffect(() => { load(); }, [load]);

  const done = (m: string) => { setModal(null); setToast(m); load(); };
  async function voidEntry(l: Line) {
    if (!window.confirm("Cancel \"" + l.label + "\"? It stays on record but no longer counts" + (l.type === "payment" || l.type === "advance" ? ", and the cash-book entry is cancelled too." : "."))) return;
    const r = await fetch("/api/employees/" + id + "/entries/" + l.id + "/void", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error || "Could not cancel");
    setToast("Entry cancelled"); load();
  }
  async function postSalary() {
    setPosting(true);
    const r = await fetch("/api/employees/accrue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const j = await r.json().catch(() => ({}));
    setPosting(false);
    if (!r.ok) return setError(j.error || "Could not post the salary");
    setToast(j.posted ? j.posted + " salary entries posted" : "Salary is already posted up to yesterday"); load();
  }

  if (!data) return <div className="p-3 lg:px-5">{error ? <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p> : <Loading />}</div>;
  const e = data.employee;
  const owed = data.balance;
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <Link href="/employees" className="text-sm text-muted underline">← Employees</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold">{e.name}</h1>
          <span className="text-sm text-muted">{e.code}</span>
          {e.status === "left" && <span className="pill bg-bg text-muted">Left {e.leave_date ? niceDate(e.leave_date) : ""}</span>}
          <span className="flex-1" />
          {can("employees.manage") && <button className="btn" onClick={() => setModal("edit")}>Edit</button>}
        </div>
      </header>

      <div className="space-y-3 p-3 lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="card p-4 lg:col-span-1">
            <p className="text-sm text-muted">{owed > 0 ? "Owed to " + e.name : owed < 0 ? "Advance he has taken" : "Nothing owed"}</p>
            <p className={"text-3xl font-bold " + (owed > 0 ? "text-amber" : owed < 0 ? "text-red" : "")}>{rs(Math.abs(owed))}</p>
            <p className="mt-1 text-sm">{rs(e.salary_amount)} per {PER[e.salary_type]}{e.salary_type === "daily" && e.weekly_off != null ? " (" + DAYS[e.weekly_off] + " off)" : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {can("employees.pay") && <button className="btn btn-primary" onClick={() => setModal("payment")}>Pay salary</button>}
              {can("employees.pay") && <button className="btn" onClick={() => setModal("advance")}>Give advance</button>}
              {can("employees.pay") && <button className="btn" onClick={() => setModal("bonus")}>+ Bonus</button>}
              {can("employees.pay") && <button className="btn" onClick={() => setModal("deduction")}>− Deduction</button>}
              {can("employees.manage") && <button className="btn" onClick={postSalary} disabled={posting}>{posting ? <><Spinner /> Posting…</> : "Post salary due"}</button>}
            </div>
          </section>

          <section className="card p-4 lg:col-span-1">
            <h2 className="mb-2 font-semibold">Details</h2>
            <dl className="grid grid-cols-3 gap-y-1 text-sm">
              <dt className="text-muted">Designation</dt><dd className="col-span-2">{e.designation || "-"}</dd>
              <dt className="text-muted">Phone</dt><dd className="col-span-2">{e.phone || "-"}</dd>
              <dt className="text-muted">CNIC</dt><dd className="col-span-2">{e.cnic || "-"}</dd>
              <dt className="text-muted">Address</dt><dd className="col-span-2">{e.address || "-"}</dd>
              <dt className="text-muted">Joined</dt><dd className="col-span-2">{niceDate(e.join_date)}</dd>
              {e.notes && <><dt className="text-muted">Notes</dt><dd className="col-span-2">{e.notes}</dd></>}
            </dl>
          </section>

          <section className="card p-4 lg:col-span-1">
            <h2 className="mb-2 font-semibold">Login</h2>
            {e.login ? (
              <p className="text-sm">Signs in as <b>{e.login.name}</b> ({e.login.role_name}){!e.login.active && <span className="pill ml-2 bg-bg text-muted">Disabled</span>}.
                {can("users.manage") && <> <Link className="underline" href="/users?tab=users">Manage logins</Link></>}</p>
            ) : (
              <>
                <p className="text-sm text-muted">No login. He can still be paid and have a ledger.</p>
                {can("users.manage") && <button className="btn mt-2" onClick={() => setModal("login")}>Create login</button>}
              </>
            )}
          </section>
        </div>

        <section className="card p-3">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <h2 className="flex-1 font-semibold">Ledger</h2>
            <div><label className="label" htmlFor="el-from">From</label><input id="el-from" className="input" type="date" value={from} onChange={(x) => setFrom(x.target.value)} /></div>
            <div><label className="label" htmlFor="el-to">To</label><input id="el-to" className="input" type="date" value={to} onChange={(x) => setTo(x.target.value)} /></div>
            {can("employees.pay") && <button className="btn" onClick={() => setModal("opening")}>Opening balance</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2">Date</th><th className="pr-2">Entry</th><th className="pr-2 text-right">Earned</th><th className="pr-2 text-right">Paid / deducted</th><th className="pr-2 text-right">Balance</th><th /></tr></thead>
              <tbody>
                {from && <tr className="text-muted"><td className="py-1 pr-2" colSpan={4}>Brought forward</td><td className="pr-2 text-right">{rs(data.opening)}</td><td /></tr>}
                {data.rows.map((l) => (
                  <tr key={l.id} className={"border-t border-line " + (l.voided ? "text-muted line-through" : "")}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{niceDate(l.date)}</td>
                    <td className="pr-2">{l.label}{l.voided && <span className="pill ml-2 bg-bg text-muted no-underline">cancelled</span>}</td>
                    <td className="pr-2 text-right">{l.debit ? rs(l.debit) : ""}</td>
                    <td className="pr-2 text-right">{l.credit ? rs(l.credit) : ""}</td>
                    <td className="pr-2 text-right font-semibold">{l.voided ? "" : rs(l.balance)}</td>
                    <td className="text-right">{can("employees.pay") && !l.voided && <button className="btn min-h-8 px-2 text-xs" onClick={() => voidEntry(l)}>Cancel</button>}</td>
                  </tr>
                ))}
                {!data.rows.length && <tr><td colSpan={6} className="py-3 text-muted">No entries yet. Salary appears here when each {PER[e.salary_type]} ends.</td></tr>}
              </tbody>
              {data.rows.length > 0 && <tfoot><tr className="border-t border-line font-semibold"><td className="py-1.5" colSpan={2}>Total</td><td className="pr-2 text-right">{rs(data.totalDebit)}</td><td className="pr-2 text-right">{rs(data.totalCredit)}</td><td className="pr-2 text-right">{rs(data.closing)}</td><td /></tr></tfoot>}
            </table>
          </div>
        </section>
      </div>

      {(modal === "payment" || modal === "advance") && <PayModal id={id} name={e.name} kind={modal} owed={owed} onClose={() => setModal(null)} onDone={done} />}
      {(modal === "bonus" || modal === "deduction" || modal === "opening") && <AdjustModal id={id} name={e.name} kind={modal} onClose={() => setModal(null)} onDone={done} />}
      {modal === "login" && <LoginModal id={id} name={e.name} onClose={() => setModal(null)} onDone={done} />}
      {modal === "edit" && <EmployeeForm initial={e} onClose={() => setModal(null)} onSaved={() => done("Saved")} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
