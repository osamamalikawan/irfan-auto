import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { EMPLOYEE_COLS, cleanEmployee } from "@/lib/employees";
import { one } from "@/lib/field";

export const dynamic = "force-dynamic";
const VIEW = ["employees.view", "employees.manage", "employees.pay"] as const;

/** ?q=&status=active|left|all (default active). Every employee with what the shop owes him now (negative = advance) and his login, if any. */
export async function GET(req: NextRequest) {
  const a = await authorize(...VIEW);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  let q = sb.from("employees").select(EMPLOYEE_COLS + ",user:app_users(id,name,active,role:roles(name))").order("name").limit(2000);
  const st = sp.get("status") ?? "active";
  if (st === "active" || st === "left") q = q.eq("status", st);
  const text = (sp.get("q") ?? "").trim().replace(/[%,()]/g, " ");
  if (text) q = q.or(`name.ilike.%${text}%,code.ilike.%${text}%,phone.ilike.%${text}%,designation.ilike.%${text}%`);
  const [emp, bal] = await Promise.all([q, sb.from("employee_balances").select("employee_id,balance")]);
  if (emp.error) return NextResponse.json({ error: emp.error.message }, { status: 500 });
  const balance = new Map(((bal.data ?? []) as { employee_id: string; balance: number }[]).map((b) => [b.employee_id, Number(b.balance)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((emp.data ?? []) as any[]).map((e) => {
    const u = one<{ id: string; name: string; active: boolean; role: { name: string } | { name: string }[] | null }>(e.user);
    const { user: _u, ...rest } = e;
    void _u;
    return { ...rest, salary_amount: Number(e.salary_amount), balance: balance.get(e.id) ?? 0, login: u ? { id: u.id, name: u.name, active: u.active, role_name: one<{ name: string }>(u.role)?.name ?? "" } : null };
  });
  const payable = items.reduce((x, e) => x + Math.max(0, e.balance), 0);
  const advances = items.reduce((x, e) => x + Math.max(0, -e.balance), 0);
  return NextResponse.json({ items, totals: { payable, advances, count: items.length } });
}

/** Body: { name, phone?, cnic?, address?, designation?, join_date?, salary_type, salary_amount, weekly_off?, notes?, opening_balance? } */
export async function POST(req: NextRequest) {
  const a = await authorize("employees.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const c = cleanEmployee(b, false);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const sb = db();
  const { data, error } = await sb.from("employees").insert(c.v).select("id,code").single();
  if (error) return dbError(error);
  const opening = Number(b?.opening_balance);
  if (Number.isFinite(opening) && opening !== 0) {
    const o = await sb.from("employee_ledger").insert({ employee_id: data.id, type: "opening", amount: Math.round(opening * 100) / 100, note: "Brought forward", created_by: a.user.id });
    if (o.error) return NextResponse.json({ error: o.error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
