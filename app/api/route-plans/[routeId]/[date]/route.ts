import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { chunk } from "@/lib/chunks";
import { cleanDate, describeSchedule, isVisitDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ routeId: string; date: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** One route on one date: the customers to visit, what they owe, and the responses recorded. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("planner.edit", "visits.record", "routes.manage", "reports.view");
  if (a.error) return a.error;
  const { routeId, date: rawDate } = await params;
  const date = cleanDate(rawDate);
  if (!date) return NextResponse.json({ error: "Bad date." }, { status: 400 });
  const sb = db();
  const r = await sb.from("routes").select("id,name,code,salesman_id,visit_days,frequency,cycle_start,month_week,fuel_cost,salesman:app_users(id,name),route_areas(area:areas(name,city:cities(name)))").eq("id", routeId).maybeSingle();
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  if (!r.data || (a.user.ownOnly && r.data.salesman_id !== a.user.id)) return NextResponse.json({ error: "Route not found." }, { status: 404 });

  const [cs, run, vs, prev] = await Promise.all([
    sb.from("customers").select("id,code,name,name_ur,owner,phone,address,area:areas(name)").eq("route_id", routeId).eq("status", "active").eq("is_walk_in", false).order("name").limit(1500),
    sb.from("route_runs").select("id,fuel_cost,note,completed_at,planned").eq("route_id", routeId).eq("run_date", date).maybeSingle(),
    sb.from("visits").select("customer_id,outcome,notes,promise_date,promise_amount,created_at").eq("route_id", routeId).eq("visit_date", date).order("created_at", { ascending: false }),
    sb.from("visits").select("customer_id,visit_date,outcome,notes,promise_date,promise_amount").eq("route_id", routeId).lt("visit_date", date).order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
  ]);
  const err = cs.error ?? run.error ?? vs.error ?? prev.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const ids = (cs.data ?? []).map((c: { id: string }) => c.id);
  const balance = new Map<string, number>();
  for (const part of chunk(ids)) {
    const b = await sb.from("customer_balances").select("customer_id,balance").in("customer_id", part);
    for (const x of b.data ?? []) balance.set(x.customer_id, Number(x.balance));
  }
  const today = new Map<string, unknown>();
  for (const v of vs.data ?? []) if (!today.has(v.customer_id)) today.set(v.customer_id, v);
  const before = new Map<string, unknown>();
  for (const v of prev.data ?? []) if (!before.has(v.customer_id)) before.set(v.customer_id, v);

  const route = r.data;
  const status = run.data ? "completed" : date < todayPk() ? "overdue" : "planned";
  return NextResponse.json({
    route: {
      id: route.id, name: route.name, code: route.code, frequency: route.frequency, fuel_cost: Number(route.fuel_cost), salesman: one(route.salesman),
      schedule: describeSchedule({ frequency: route.frequency, visit_days: route.visit_days ?? [], cycle_start: route.cycle_start, month_week: route.month_week }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areas: (route.route_areas ?? []).map((x: any) => one(x.area)?.name).filter(Boolean),
    },
    date, scheduled: isVisitDate({ frequency: route.frequency, visit_days: route.visit_days ?? [], cycle_start: route.cycle_start, month_week: route.month_week }, date), status, run: run.data ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customers: (cs.data ?? []).map((c: any) => ({ id: c.id, code: c.code, name: c.name, name_ur: c.name_ur, owner: c.owner, phone: c.phone, address: c.address, area: one(c.area)?.name ?? "", balance: balance.get(c.id) ?? 0, response: today.get(c.id) ?? null, previous: before.get(c.id) ?? null })),
  });
}
