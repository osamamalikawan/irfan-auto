import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { EMPLOYEE_COLS, ENTRY_COLS, cleanEmployee, employeeStatement, postSalary, type EmployeeRow, type EntryRow } from "@/lib/employees";
import { isDate, isUuid, one, todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?from=&to=  The employee, what the shop owes him now, his login and the ledger of the period. The salary that is due is posted first. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("employees.view", "employees.manage", "employees.pay");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const sb = db();
  const emp = await sb.from("employees").select(EMPLOYEE_COLS + ",user:app_users(id,name,active,role:roles(name))").eq("id", id).maybeSingle();
  if (emp.error) return NextResponse.json({ error: emp.error.message }, { status: 500 });
  if (!emp.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const e = emp.data as unknown as EmployeeRow & { user: unknown };
  try { await postSalary(sb, e, todayPk()); } catch { /* the ledger is still shown */ }
  const led = await sb.from("employee_ledger").select(ENTRY_COLS).eq("employee_id", id).order("entry_date").limit(5000);
  if (led.error) return NextResponse.json({ error: led.error.message }, { status: 500 });
  const sp = req.nextUrl.searchParams;
  const st = employeeStatement((led.data ?? []) as unknown as EntryRow[], isDate(sp.get("from")) ? sp.get("from") : null, isDate(sp.get("to")) ? sp.get("to") : null);
  const u = one<{ id: string; name: string; active: boolean; role: { name: string } | { name: string }[] | null }>(e.user as never);
  const { user: _u, ...rest } = e;
  void _u;
  return NextResponse.json({
    employee: { ...rest, salary_amount: Number(e.salary_amount), login: u ? { id: u.id, name: u.name, active: u.active, role_name: one<{ name: string }>(u.role)?.name ?? "" } : null },
    ...st,
  });
}

/** Edit details, salary and status. Any field may be left out. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("employees.manage");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const c = cleanEmployee(b, true);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const sb = db();
  const cur = await sb.from("employees").select("user_id").eq("id", id).maybeSingle();
  if (!cur.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const { error } = await sb.from("employees").update(c.v).eq("id", id);
  if (error) return dbError(error);
  // the name of a person with a login is the name on his login
  if (c.v.name && cur.data.user_id) {
    const u = await sb.from("app_users").update({ name: c.v.name }).eq("id", cur.data.user_id);
    if (u.error) return NextResponse.json({ error: u.error.code === "23505" ? "Another login already has that name." : u.error.message }, { status: u.error.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
