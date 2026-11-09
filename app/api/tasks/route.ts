import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { loadPromises } from "@/lib/promises-data";
import { cleanDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const READ = ["sales.create", "sales.status", "payments.receive", "visits.record", "reports.view", "customers.view"] as const;

export type TaskItem = {
  id: string; kind: "order" | "promise" | "task"; date: string; title: string; sub: string; done: boolean;
  action?: "pack" | "deliver" | "complete"; sale_id?: string; sale_no?: string; sale_status?: string;
  customer_id?: string; amount?: number; status?: string; note?: string | null;
};

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD  everything planned in that range: scheduled orders, customer promises, your own tasks. */
export async function GET(req: NextRequest) {
  const a = await authorize(...READ);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  const from = cleanDate(sp.get("from")) ?? today, to = cleanDate(sp.get("to")) ?? from;
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  const items: TaskItem[] = [];

  const st = await sb.from("sale_tasks").select("id,action,due_date,note,done_at,sale:sales(id,no,customer_name,status,fulfil_status,total,route_id)").gte("due_date", from).lte("due_date", to).order("due_date").limit(1500);
  if (st.error) return NextResponse.json({ error: st.error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (st.data ?? []) as any[]) {
    const s = one(t.sale);
    if (!s || s.status !== "confirmed") continue;
    if (mine && !(s.route_id && mine.includes(s.route_id))) continue;
    items.push({ id: t.id, kind: "order", date: t.due_date, title: ({ pack: "Pack", deliver: "Deliver", complete: "Complete" } as const)[t.action as "pack"] + " " + s.no, sub: s.customer_name, done: !!t.done_at,
      action: t.action, sale_id: s.id, sale_no: s.no, sale_status: s.fulfil_status, amount: Number(s.total), note: t.note });
  }

  const pr = await loadPromises(sb, a.user, today);
  if (!pr.ok) return NextResponse.json({ error: pr.error }, { status: 500 });
  for (const p of pr.items) {
    if (p.date < from || p.date > to) continue;
    items.push({ id: "promise:" + p.customer.id + ":" + p.date, kind: "promise", date: p.date, title: "Promise to pay " + Number(p.amount).toLocaleString("en-US"), sub: p.customer.name + (p.customer.area ? " - " + p.customer.area : ""),
      done: p.status === "kept", customer_id: p.customer.id, amount: p.amount, status: p.status, note: p.notes });
  }

  const tk = await sb.from("tasks").select("id,title,due_date,note,done_at,customer:customers(id,name)").gte("due_date", from).lte("due_date", to).order("due_date").limit(1500);
  if (tk.error) return NextResponse.json({ error: tk.error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (tk.data ?? []) as any[]) items.push({ id: t.id, kind: "task", date: t.due_date, title: t.title, sub: one(t.customer)?.name ?? "", done: !!t.done_at, customer_id: one(t.customer)?.id, note: t.note });

  return NextResponse.json({ today, from, to, items });
}

/** Add your own task. Body: { title, due_date, note?, customer_id? } */
export async function POST(req: NextRequest) {
  const a = await authorize(...READ);
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const title = String(b?.title ?? "").trim().slice(0, 120);
  const date = cleanDate(b?.due_date);
  if (!title) return NextResponse.json({ error: "Enter what has to be done." }, { status: 400 });
  if (!date) return NextResponse.json({ error: "Choose a date." }, { status: 400 });
  // the salesman app may send the same task twice after a lost answer: the second one changes nothing
  const idem = String(b?.idem_key ?? "").trim().slice(0, 80) || null;
  if (idem) {
    const dup = await db().from("tasks").select("id").eq("idem_key", idem).maybeSingle();
    if (dup.data) return NextResponse.json({ id: dup.data.id, duplicate: true });
  }
  const { data, error } = await db().from("tasks").insert({ title, due_date: date, note: String(b?.note ?? "").trim().slice(0, 300) || null, customer_id: b?.customer_id || null, created_by: a.user.id, idem_key: idem }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
