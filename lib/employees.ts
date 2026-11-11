import type { db } from "./supabase";
import { cleanText, isDate, todayPk } from "./field";
import { addDays, daysInMonth, shiftMonth } from "./schedule";

type SB = ReturnType<typeof db>;

export const SALARY_TYPES = ["daily", "weekly", "monthly"] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];
export type EmployeeRow = {
  id: string; code: string; name: string; phone: string | null; cnic: string | null; address: string | null; designation: string | null;
  join_date: string; leave_date: string | null; status: "active" | "left"; salary_type: SalaryType; salary_amount: number;
  weekly_off: number | null; accrue_from: string | null; notes: string | null; user_id: string | null;
};
export const EMPLOYEE_COLS = "id,code,name,phone,cnic,address,designation,join_date,leave_date,status,salary_type,salary_amount,weekly_off,accrue_from,notes,user_id";

const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const round2 = (n: number) => Math.round(n * 100) / 100;
const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export type Period = { from: string; to: string; amount: number };

/** The salary periods that are over and should be on the ledger by `today`, from the day salary starts. Nothing is posted for the current,
 *  unfinished day / week / month. A part period (joined or left in the middle) is paid in proportion. */
export function salaryPeriods(e: Pick<EmployeeRow, "salary_type" | "salary_amount" | "join_date" | "accrue_from" | "leave_date" | "weekly_off">, today: string): Period[] {
  const amount = Number(e.salary_amount);
  if (!(amount > 0)) return [];
  const start = e.accrue_from ?? e.join_date;
  const yesterday = addDays(today, -1);
  const stop = e.leave_date && e.leave_date < yesterday ? e.leave_date : yesterday; // the last day that can be posted now
  if (stop < start) return [];
  const out: Period[] = [];
  if (e.salary_type === "daily") {
    for (let d = start; d <= stop && out.length < 400; d = addDays(d, 1)) {
      if (e.weekly_off != null && dow(d) === e.weekly_off) continue;
      out.push({ from: d, to: d, amount });
    }
  } else if (e.salary_type === "weekly") {
    for (let f = start; out.length < 120; f = addDays(f, 7)) {
      const full = addDays(f, 6);
      const last = e.leave_date && e.leave_date < full ? e.leave_date : full;
      if (last > stop || f > last) break; // the week is not over yet, or he had already left
      out.push({ from: f, to: last, amount: round2((amount * (dayDiff(f, last) + 1)) / 7) });
    }
  } else {
    for (let ym = start.slice(0, 7); out.length < 60; ym = shiftMonth(ym, 1)) {
      const first = ym + "-01";
      const lastDay = ym + "-" + String(daysInMonth(ym)).padStart(2, "0");
      const from = first < start ? start : first;
      const to = e.leave_date && e.leave_date < lastDay ? e.leave_date : lastDay;
      if (to > stop || from > to) break; // the month is not over yet, or he had already left
      out.push({ from, to, amount: from === first && to === lastDay ? amount : round2((amount * (dayDiff(from, to) + 1)) / daysInMonth(ym)) });
    }
  }
  return out;
}

/** Puts the salary periods that are due on the employee's ledger (each period only once, even if this runs twice). Returns how many were added. */
export async function postSalary(sb: SB, e: EmployeeRow, today: string): Promise<number> {
  const periods = salaryPeriods(e, today);
  if (!periods.length) return 0;
  const have = await sb.from("employee_ledger").select("period_from").eq("employee_id", e.id).eq("type", "salary").gte("period_from", periods[0].from).limit(5000);
  if (have.error) throw new Error(have.error.message);
  const done = new Set(((have.data ?? []) as { period_from: string }[]).map((r) => r.period_from));
  const rows = periods.filter((p) => !done.has(p.from)).map((p) => ({ employee_id: e.id, entry_date: p.to, type: "salary", amount: p.amount, period_from: p.from, period_to: p.to }));
  if (!rows.length) return 0;
  const ins = await sb.from("employee_ledger").insert(rows);
  if (!ins.error) return rows.length;
  if (ins.error.code !== "23505") throw new Error(ins.error.message);
  let n = 0; // somebody posted at the same moment: add what is still missing one by one
  for (const r of rows) if (!(await sb.from("employee_ledger").insert(r)).error) n++;
  return n;
}

export async function postSalaryAll(sb: SB, today: string): Promise<number> {
  const r = await sb.from("employees").select(EMPLOYEE_COLS).gt("salary_amount", 0);
  if (r.error) throw new Error(r.error.message);
  let n = 0;
  for (const e of (r.data ?? []) as unknown as EmployeeRow[]) n += await postSalary(sb, e, today);
  return n;
}

export const rateText = (e: Pick<EmployeeRow, "salary_type" | "salary_amount">) =>
  "Rs " + Number(e.salary_amount).toLocaleString("en-PK") + " per " + (e.salary_type === "daily" ? "day" : e.salary_type === "weekly" ? "week" : "month");

export type EntryRow = { id: string; created_at: string; entry_date: string; type: string; amount: number; note: string | null; period_from: string | null; period_to: string | null; method: string | null; voided: boolean };
export const ENTRY_COLS = "id,created_at,entry_date,type,amount,note,period_from,period_to,method,voided";

function labelOf(r: EntryRow): string {
  const tail = r.note ? " - " + r.note : "";
  switch (r.type) {
    case "opening": return "Opening balance" + tail;
    case "salary": {
      const f = r.period_from ?? r.entry_date, t = r.period_to ?? f;
      const monthFull = f.slice(0, 7) === t.slice(0, 7) && f.endsWith("-01") && Number(t.slice(8)) === daysInMonth(t.slice(0, 7));
      if (monthFull) return "Salary " + new Date(f + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      return "Salary " + (f === t ? shortDate(f) : shortDate(f) + " to " + shortDate(t));
    }
    case "bonus": return "Bonus" + tail;
    case "deduction": return "Deduction" + tail;
    case "advance": return "Advance given" + (r.method ? " (" + r.method + ")" : "") + tail;
    default: return "Salary paid" + (r.method ? " (" + r.method + ")" : "") + tail;
  }
}

/** The employee's ledger with a running balance (what the shop owes him; negative = advance he has to work off). Cancelled entries are shown but not counted. */
export function employeeStatement(rows: EntryRow[], from?: string | null, to?: string | null) {
  const all = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
  const live = (r: EntryRow) => !r.voided;
  const opening = all.filter((r) => live(r) && from && r.entry_date < from).reduce((x, r) => x + Number(r.amount), 0);
  let run = opening;
  const lines = all.filter((r) => (!from || r.entry_date >= from) && (!to || r.entry_date <= to)).map((r) => {
    if (live(r)) run += Number(r.amount);
    const amt = Number(r.amount);
    return { id: r.id, date: r.entry_date, type: r.type, label: labelOf(r), voided: r.voided, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, balance: run };
  });
  return {
    opening, closing: run, balance: all.filter(live).reduce((x, r) => x + Number(r.amount), 0), rows: lines,
    totalDebit: lines.filter((l) => !l.voided).reduce((x, l) => x + l.debit, 0), totalCredit: lines.filter((l) => !l.voided).reduce((x, l) => x + l.credit, 0),
  };
}

/** Fields shared by create and edit. Returns an error message or the cleaned values. */
export function cleanEmployee(b: Record<string, unknown> | null, partial: boolean): { error: string } | { v: Record<string, unknown> } {
  const v: Record<string, unknown> = {};
  const has = (k: string) => !partial || (b !== null && k in b);
  if (has("name")) {
    const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) return { error: "Name is required." };
    v.name = name.slice(0, 80);
  }
  for (const k of ["phone", "cnic", "address", "designation", "notes"] as const) if (has(k)) v[k] = cleanText(b?.[k], k === "address" || k === "notes" ? 300 : 60);
  if (has("join_date")) {
    if (b?.join_date !== undefined && b?.join_date !== "" && !isDate(b?.join_date)) return { error: "The joining date is not valid." };
    if (isDate(b?.join_date)) v.join_date = b?.join_date;
  }
  for (const k of ["leave_date", "accrue_from"] as const) if (has(k)) {
    if (b?.[k] !== undefined && b?.[k] !== null && b?.[k] !== "" && !isDate(b?.[k])) return { error: "A date is not valid." };
    v[k] = isDate(b?.[k]) ? b?.[k] : null;
  }
  if (has("salary_type")) {
    if (!(SALARY_TYPES as readonly string[]).includes(String(b?.salary_type))) return { error: "Choose daily, weekly or monthly salary." };
    v.salary_type = b?.salary_type as SalaryType;
  }
  if (has("salary_amount")) {
    const n = Number(b?.salary_amount);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { error: "Enter the salary amount." };
    v.salary_amount = Math.round(n * 100) / 100;
  }
  if (has("weekly_off")) {
    const w = b?.weekly_off === null || b?.weekly_off === "" || b?.weekly_off === undefined ? null : Number(b.weekly_off);
    if (w !== null && !(Number.isInteger(w) && w >= 0 && w <= 6)) return { error: "Choose the weekly off day." };
    v.weekly_off = w;
  }
  if (has("status")) {
    if (b?.status !== "active" && b?.status !== "left") return { error: "Status must be active or left." };
    v.status = b?.status;
    if (b?.status === "active") v.leave_date = null;
    else if (!isDate(b?.leave_date)) v.leave_date = todayPk();
  }
  return { v };
}


/** The ledger of the employee record that belongs to this login (null if there is none): his salary account. Salary that is due is posted first. */
export async function myEmployeeLedger(sb: SB, userId: string, today: string, from: string | null, to: string | null) {
  const emp = await sb.from("employees").select(EMPLOYEE_COLS).eq("user_id", userId).maybeSingle();
  if (emp.error) throw new Error(emp.error.message);
  if (!emp.data) return null;
  const e = emp.data as unknown as EmployeeRow;
  try { await postSalary(sb, e, today); } catch { /* the ledger is still shown */ }
  const led = await sb.from("employee_ledger").select(ENTRY_COLS).eq("employee_id", e.id).order("entry_date").limit(5000);
  if (led.error) throw new Error(led.error.message);
  const st = employeeStatement((led.data ?? []) as unknown as EntryRow[], from, to);
  return {
    employee: { code: e.code, name: e.name, designation: e.designation, salary_type: e.salary_type, salary_amount: Number(e.salary_amount), join_date: e.join_date, status: e.status, rate: rateText(e) },
    balance: st.balance, opening: st.opening, closing: st.closing, totalDebit: st.totalDebit, totalCredit: st.totalCredit,
    rows: st.rows.filter((r) => !r.voided).map((r) => ({ date: r.date, type: r.type, label: r.label, debit: r.debit, credit: r.credit, balance: r.balance })),
  };
}
