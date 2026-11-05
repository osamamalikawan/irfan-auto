import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { cleanDate } from "@/lib/schedule";

type Ctx = { params: Promise<{ id: string }> };
const TARGET: Record<string, string> = { pack: "packed", deliver: "delivered", complete: "completed" };
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

async function load(id: string, user: Parameters<typeof allowedRouteIds>[1]) {
  const sb = db();
  const t = await sb.from("sale_tasks").select("id,sale_id,action,due_date,done_at,sale:sales(id,no,status,fulfil_status,sale_kind,total,paid,route_id)").eq("id", id).maybeSingle();
  const sale = Array.isArray(t.data?.sale) ? t.data?.sale[0] : t.data?.sale;
  const mine = await allowedRouteIds(sb, user);
  if (!t.data || !sale || (mine && !(sale.route_id && mine.includes(sale.route_id)))) return null;
  return { sb, task: t.data, sale };
}

/** Body: { done: true } does the scheduled action (pack / deliver / complete) and ticks it off.  { done: false } re-opens it.  { due_date?, note? } reschedules. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.status");
  if (a.error) return a.error;
  const { id } = await params;
  const x = await load(id, a.user);
  if (!x) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const { sb, task, sale } = x;

  if (b?.done === true) {
    if (task.done_at) return NextResponse.json({ ok: true });
    if (sale.status !== "confirmed") return NextResponse.json({ error: "This invoice is cancelled." }, { status: 400 });
    const target = TARGET[task.action];
    if (sale.sale_kind === "counter" && Number(sale.paid) < Number(sale.total)) return NextResponse.json({ error: "A counter sale on hold stays Active until it is paid." }, { status: 400 });
    const r = await sb.from("sales").update({ fulfil_status: target, status_changed_at: new Date().toISOString(), status_changed_by: a.user.id }).eq("id", sale.id);
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    const u = await sb.from("sale_tasks").update({ done_at: new Date().toISOString(), done_by: a.user.id }).eq("id", id);
    if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: target });
  }
  if (b?.done === false) {
    const u = await sb.from("sale_tasks").update({ done_at: null, done_by: null }).eq("id", id);
    if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const patch: { due_date?: string; note?: string | null } = {};
  if (b?.due_date !== undefined) {
    const d = cleanDate(b.due_date);
    if (!d || d < todayPk()) return NextResponse.json({ error: "Choose today or a later date." }, { status: 400 });
    patch.due_date = d;
  }
  if (b?.note !== undefined) patch.note = String(b.note ?? "").trim().slice(0, 200) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const u = await sb.from("sale_tasks").update(patch).eq("id", id);
  if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.status");
  if (a.error) return a.error;
  const { id } = await params;
  const x = await load(id, a.user);
  if (!x) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const { error } = await x.sb.from("sale_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
