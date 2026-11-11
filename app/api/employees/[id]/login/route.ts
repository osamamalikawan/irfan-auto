import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { pinError } from "@/lib/pin";
import { isUuid } from "@/lib/field";

type Ctx = { params: Promise<{ id: string }> };

/** Give an employee a login. Body: { role_id, pin, is_salesman? }. The login takes the employee's name; he must choose his own PIN when he first signs in. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const pin = String(b?.pin ?? "");
  const bad = pinError(pin);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const sb = db();
  const emp = await sb.from("employees").select("id,name,user_id,status").eq("id", id).maybeSingle();
  if (!emp.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (emp.data.user_id) return NextResponse.json({ error: "This employee already has a login." }, { status: 409 });
  const role = await sb.from("roles").select("id").eq("id", String(b?.role_id ?? "")).maybeSingle();
  if (!role.data) return NextResponse.json({ error: "Choose a role." }, { status: 400 });
  const u = await sb.from("app_users").insert({ name: emp.data.name, role_id: role.data.id, pin_hash: await bcrypt.hash(pin, 10), must_change_pin: true, active: emp.data.status === "active", is_salesman: !!b?.is_salesman }).select("id").single();
  if (u.error) return NextResponse.json({ error: u.error.code === "23505" ? "A login called '" + emp.data.name + "' already exists. Change the employee's name first." : u.error.message }, { status: u.error.code === "23505" ? 409 : 500 });
  const link = await sb.rpc("employee_link_user", { p_employee: id, p_user: u.data.id });
  if (link.error) { await sb.from("app_users").delete().eq("id", u.data.id); return dbError(link.error); }
  return NextResponse.json({ user_id: u.data.id }, { status: 201 });
}
