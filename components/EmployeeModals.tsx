"use client";
import { useEffect, useState } from "react";
import { todayPk } from "@/lib/dates";
import { Spinner } from "./Loading";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[94dvh] w-full max-w-md overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2"><h2 className="flex-1 text-base font-semibold">{title}</h2><button className="btn min-h-9" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

async function post(url: string, body: object): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? null : j.error || "Could not save";
  } catch { return "No connection. Try again."; }
}

const METHODS = ["Cash", "Bank", "JazzCash", "Easypaisa", "Cheque"];

/** Pay salary, or give an advance. The cash book (Expenses > Salaries) is updated with it. */
export function PayModal({ id, name, kind, owed, onClose, onDone }: { id: string; name: string; kind: "payment" | "advance"; owed: number; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(kind === "payment" && owed > 0 ? String(owed) : "");
  const [date, setDate] = useState(todayPk());
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  return (
    <Shell title={(kind === "advance" ? "Give advance to " : "Pay salary to ") + name} onClose={onClose}>
      {kind === "payment" && owed > 0 && <p className="mb-2 text-sm text-muted">Owed to him now: <b className="text-ink">Rs {owed.toLocaleString("en-PK")}</b></p>}
      <label className="label" htmlFor="pm-amt">Amount (Rs)</label>
      <input id="pm-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
      <p className="label mt-3">Paid by</p>
      <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
        {METHODS.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} className={"chip " + (method === m ? "chip-on" : "")} onClick={() => setMethod(m)}>{m}</button>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="pm-date">Date</label><input id="pm-date" className="input" type="date" max={todayPk()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="pm-note">Note</label><input id="pm-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !(n > 0)} onClick={async () => {
        setBusy(true); setError("");
        const e = await post("/api/employees/" + id + "/pay", { kind, amount: n, date, method, note });
        setBusy(false);
        if (e) return setError(e);
        onDone(kind === "advance" ? "Advance recorded" : "Salary payment recorded");
      }}>{busy ? <><Spinner /> Saving…</> : kind === "advance" ? "Give advance" : "Pay salary"}</button>
    </Shell>
  );
}

/** A bonus (the shop owes him more), a deduction (absence, fine), or an opening balance. */
export function AdjustModal({ id, name, kind, onClose, onDone }: { id: string; name: string; kind: "bonus" | "deduction" | "opening"; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayPk());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  const title = kind === "bonus" ? "Bonus for " : kind === "deduction" ? "Deduction from " : "Opening balance of ";
  return (
    <Shell title={title + name} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">
        {kind === "bonus" ? "Added to what the shop owes him. Pay it later with Pay salary." : kind === "deduction" ? "Taken from what the shop owes him (for absence, a fine, goods taken…)." : "What was already owed before this system: a plus number when the shop owes him, a minus number when he owes the shop."}
      </p>
      <label className="label" htmlFor="ad-amt">Amount (Rs)</label>
      <input id="ad-amt" className="input text-xl font-semibold" type="number" inputMode="decimal" min={kind === "opening" ? undefined : "0"} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="ad-date">Date</label><input id="ad-date" className="input" type="date" max={todayPk()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="ad-note">Reason</label><input id="ad-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !Number.isFinite(n) || n === 0 || (kind !== "opening" && n < 0)} onClick={async () => {
        setBusy(true); setError("");
        const e = await post("/api/employees/" + id + "/adjust", { kind, amount: n, date, note });
        setBusy(false);
        if (e) return setError(e);
        onDone(kind === "bonus" ? "Bonus added" : kind === "deduction" ? "Deduction added" : "Opening balance added");
      }}>{busy ? <><Spinner /> Saving…</> : "Save"}</button>
    </Shell>
  );
}

/** Give an employee who has no login a login (he chooses his own PIN when he first signs in). */
export function LoginModal({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: (m: string) => void }) {
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [role, setRole] = useState("");
  const [pin, setPin] = useState("");
  const [salesman, setSalesman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/roles").then((r) => r.json()).then((j) => setRoles(j.roles ?? [])).catch(() => {}); }, []);
  return (
    <Shell title={"Create login for " + name} onClose={onClose}>
      <label className="label" htmlFor="lg-role">Role</label>
      <select id="lg-role" className="input" value={role} onChange={(e) => { setRole(e.target.value); const r = roles.find((x) => x.id === e.target.value); setSalesman(!!r && /sales/i.test(r.name)); }}>
        <option value="">Choose a role…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <label className="label mt-3" htmlFor="lg-pin">First PIN (4 to 8 digits)</label>
      <input id="lg-pin" className="input" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={salesman} onChange={(e) => setSalesman(e.target.checked)} /> He is a salesman (uses the salesman app)</label>
      <p className="mt-1 text-xs text-muted">He signs in with the name <b>{name}</b> and this PIN, and can choose his own PIN after that.</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !role || pin.length < 4} onClick={async () => {
        setBusy(true); setError("");
        const e = await post("/api/employees/" + id + "/login", { role_id: role, pin, is_salesman: salesman });
        setBusy(false);
        if (e) return setError(e);
        onDone("Login created");
      }}>{busy ? <><Spinner /> Creating…</> : "Create login"}</button>
    </Shell>
  );
}
