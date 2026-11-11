"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { rs } from "@/lib/format";
import EmployeeForm from "./EmployeeForm";
import { Loading, Spinner } from "./Loading";
import { useMe } from "./Me";
import Toast from "./Toast";

export type Emp = {
  id: string; code: string; name: string; phone: string | null; cnic: string | null; address: string | null; designation: string | null; join_date: string; leave_date: string | null;
  status: "active" | "left"; salary_type: "daily" | "weekly" | "monthly"; salary_amount: number; weekly_off: number | null; notes: string | null; balance?: number;
  login: { id: string; name: string; active: boolean; role_name: string } | null;
};
export const PER = { daily: "day", weekly: "week", monthly: "month" } as const;

export default function EmployeesList() {
  const { can } = useMe();
  const canManage = can("employees.manage");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "left" | "all">("active");
  const [items, setItems] = useState<Emp[] | null>(null);
  const [totals, setTotals] = useState({ payable: 0, advances: 0, count: 0 });
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/employees?status=" + status + "&q=" + encodeURIComponent(q));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the employees");
      setItems(j.items ?? []); setTotals(j.totals ?? { payable: 0, advances: 0, count: 0 }); setError("");
    } catch (e) { setError((e as Error).message); setItems((x) => x ?? []); }
  }, [status, q]);

  // the salary that has become due is posted when this page opens (each period only once), then the list is shown
  useEffect(() => {
    let stop = false;
    (async () => {
      if (canManage || can("employees.pay")) await fetch("/api/employees/accrue", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
      if (!stop) load();
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function postSalary() {
    setPosting(true);
    try {
      const r = await fetch("/api/employees/accrue", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not post the salary");
      setToast(j.posted ? j.posted + " salary entries posted" : "Salary is already posted up to yesterday");
      load();
    } catch (e) { setError((e as Error).message); } finally { setPosting(false); }
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:static lg:border-0 lg:px-5 lg:pt-4">
        <h1 className="text-lg font-bold lg:hidden">Employees</h1>
        <p className="mb-2 text-sm text-muted">Details, salary and payments of everyone who works for you. Every login is an employee too.</p>
        <div className="grid max-w-2xl grid-cols-3 gap-2">
          <div className="card p-3"><p className="text-xs text-muted">Owed to employees</p><p className="text-lg font-bold">{rs(totals.payable)}</p></div>
          <div className="card p-3"><p className="text-xs text-muted">Advances given</p><p className="text-lg font-bold">{rs(totals.advances)}</p></div>
          <div className="card p-3"><p className="text-xs text-muted">Employees</p><p className="text-lg font-bold">{totals.count}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="input max-w-xs flex-1" placeholder="Search name, code, phone" aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} />
          {(["active", "left", "all"] as const).map((s) => <button key={s} className={"chip " + (status === s ? "chip-on" : "")} onClick={() => setStatus(s)}>{s === "active" ? "Working" : s === "left" ? "Left" : "All"}</button>)}
          <span className="flex-1" />
          {canManage && <button className="btn" onClick={postSalary} disabled={posting}>{posting ? <><Spinner /> Posting…</> : "Post salary due"}</button>}
          {canManage && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add employee</button>}
        </div>
      </header>

      <div className="space-y-2 p-3 lg:px-5">
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        {items === null && <Loading />}
        {items && !items.length && !error && <p className="card p-4 text-sm text-muted">No employees found.</p>}
        <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {items?.map((e) => {
            const bal = e.balance ?? 0;
            return (
              <li key={e.id}>
                <Link href={"/employees/" + e.id} className="card block p-3 active:opacity-70">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.name}{e.status === "left" && <span className="pill ml-2 bg-bg text-muted">Left</span>}</p>
                      <p className="text-xs text-muted">{e.code}{e.designation ? " · " + e.designation : ""}{e.phone ? " · " + e.phone : ""}</p>
                      <p className="mt-1 text-sm">{rs(e.salary_amount)} per {PER[e.salary_type]}</p>
                    </div>
                    <div className="text-right">
                      {bal > 0 ? <span className="pill bg-amber-bg text-amber">Owed {rs(bal)}</span> : bal < 0 ? <span className="pill bg-red-bg text-red">Advance {rs(-bal)}</span> : <span className="pill bg-bg text-muted">Settled</span>}
                      {e.login && <p className="mt-1 text-xs text-muted">Login: {e.login.role_name}</p>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {adding && <EmployeeForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setToast("Employee added"); load(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
