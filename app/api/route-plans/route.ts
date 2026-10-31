import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { addDays, cleanDate, isVisitDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** ?from=&to=  (up to 62 days)  every route visit planned in that period, with its status */
export async function GET(req: NextRequest) {
  const a = await authorize("planner.edit", "visits.record", "routes.manage", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  const from = cleanDate(sp.get("from")) ?? today;
  let to = cleanDate(sp.get("to")) ?? from;
  if (to < from) to = from;
  if (to > addDays(from, 61)) to = addDays(from, 61);
  const sb = db();
  let rq = sb.from("routes").select("id,name,code,salesman_id,visit_days,frequency,cycle_start,month_week,fuel_cost,salesman:app_users(id,name),route_areas(area:areas(name,city:cities(name)))").eq("active", true).order("name");
  if (a.user.ownOnly) rq = rq.eq("salesman_id", a.user.id);
  const [routes, runs, counts] = await Promise.all([
    rq, sb.from("route_runs").select("id,route_id,run_date,fuel_cost").gte("run_date", from).lte("run_date", to), sb.rpc("route_customer_counts"),
  ]);
  const err = routes.error ?? runs.error ?? counts.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const n = new Map<string, number>((counts.data ?? []).map((c: { route_id: string; n: number }) => [c.route_id, Number(c.n)]));
  const done = new Map((runs.data ?? []).map((r: { id: string; route_id: string; run_date: string; fuel_cost: number }) => [r.route_id + "|" + r.run_date, r]));
  const out: unknown[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (routes.data ?? []) as any[]) {
      if (!isVisitDate({ frequency: r.frequency, visit_days: r.visit_days ?? [], cycle_start: r.cycle_start, month_week: r.month_week }, d)) continue;
      const run = done.get(r.id + "|" + d);
      out.push({
        key: r.id + "|" + d, date: d, route_id: r.id, name: r.name, code: r.code, frequency: r.frequency, salesman: one(r.salesman)?.name ?? "", planned: n.get(r.id) ?? 0, fuel_cost: Number(r.fuel_cost),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        areas: (r.route_areas ?? []).map((x: any) => one(x.area)?.name).filter(Boolean), status: run ? "completed" : d < today ? "overdue" : "planned", run_id: run?.id ?? null,
      });
    }
  }
  return NextResponse.json({ from, to, items: out });
}
