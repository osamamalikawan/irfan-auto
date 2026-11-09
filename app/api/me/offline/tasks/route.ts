import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { hasPerm } from "@/lib/permissions";
import { loadPromises } from "@/lib/promises-data";
import { addDays, cleanDate } from "@/lib/schedule";
import { todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export type TaskRow = {
  id: string; kind: "order" | "promise" | "task"; date: string; title: string; sub: string; done: boolean;
  action?: string; sale_id?: string; sale_no?: string; sale_status?: string; customer_id?: string; amount?: number; status?: string; note?: string | null;
};

/** ?from=&to=  (default: 14 days back to 30 days ahead) What is planned for this salesman: scheduled actions on his orders (pack / deliver / complete),
 *  promises his customers made to pay, and his own tasks (and tasks the office set for his customers). `can.sale_status`: he may tick off order actions. */
export async function GET(req: NextRequest) {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This is for salesmen." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  const from = cleanDate(sp.get("from")) ?? addDays(today, -14), to = cleanDate(sp.get("to")) ?? addDays(today, 30);
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  const items: TaskRow[] = [];

  const st = await sb.from("sale_tasks").select("id,action,due_date,note,done_at,sale:sales(id,no,customer_id,customer_name,status,fulfil_status,total,route_id)").gte("due_date", from).lte("due_date", to).order("due_date").limit(1500);
  if (st.error) return NextResponse.json({ error: st.error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (st.data ?? []) as any[]) {
    const s = one(t.sale);
    if (!s || s.status !== "confirmed") continue;
    if (mine && !(s.route_id && mine.includes(s.route_id))) continue;
    items.push({
      id: t.id, kind: "order", date: t.due_date, title: ({ pack: "Pack", deliver: "Deliver", complete: "Complete" } as Record<string, string>)[t.action] + " " + s.no, sub: s.customer_name, done: !!t.done_at,
      action: t.action, sale_id: s.id, sale_no: s.no, sale_status: s.fulfil_status, customer_id: s.customer_id, amount: Number(s.total), note: t.note,
    });
  }

  const pr = await loadPromises(sb, a.user, today);
  if (!pr.ok) return NextResponse.json({ error: pr.error }, { status: 500 });
  for (const p of pr.items) {
    if (p.date < from || p.date > to) continue;
    items.push({
      id: "promise:" + p.customer.id + ":" + p.date, kind: "promise", date: p.date, title: "Promise to pay " + Number(p.amount).toLocaleString("en-US"),
      sub: p.customer.name + (p.customer.area ? " - " + p.customer.area : ""), done: p.status === "kept", customer_id: p.customer.id, amount: p.amount, status: p.status, note: p.notes,
    });
  }

  // own tasks, and the tasks of customers on his routes
  const cs = await sb.rpc("salesman_customers", { p_user: a.user.id });
  const custIds = ((cs.data ?? []) as { id: string }[]).map((c) => c.id);
  const sel = "id,title,due_date,note,done_at,customer:customers(id,name)";
  const found = new Map<string, unknown>();
  const own = await sb.from("tasks").select(sel).eq("created_by", a.user.id).gte("due_date", from).lte("due_date", to).limit(1500);
  for (const t of (own.data ?? []) as { id: string }[]) found.set(t.id, t);
  for (let i = 0; i < custIds.length; i += 100) {
    const r = await sb.from("tasks").select(sel).in("customer_id", custIds.slice(i, i + 100)).gte("due_date", from).lte("due_date", to).limit(1500);
    for (const t of (r.data ?? []) as { id: string }[]) found.set(t.id, t);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of found.values() as Iterable<any>) {
    items.push({ id: t.id, kind: "task", date: t.due_date, title: t.title, sub: one(t.customer)?.name ?? "", done: !!t.done_at, customer_id: one(t.customer)?.id, note: t.note });
  }
  items.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
  return NextResponse.json({ today, from, to, items, can: { sale_status: hasPerm(a.user, "sales.status") } });
}
