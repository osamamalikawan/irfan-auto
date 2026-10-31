import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { isVisitDate, cleanDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** ?date=YYYY-MM-DD  the routes scheduled that day, with their customers and which were visited */
export async function GET(req: NextRequest) {
  const a = await authorize("planner.edit", "visits.record", "routes.manage", "reports.view");
  if (a.error) return a.error;
  const date = cleanDate(req.nextUrl.searchParams.get("date"));
  if (!date) return NextResponse.json({ error: "Choose a date." }, { status: 400 });
  const sb = db();
  let rq = sb.from("routes").select("id,name,code,salesman_id,visit_days,frequency,cycle_start,month_week,salesman:app_users(id,name)").eq("active", true).order("name");
  if (a.user.ownOnly) rq = rq.eq("salesman_id", a.user.id);
  const r = await rq;
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routes = (r.data ?? []).filter((x: any) => isVisitDate({ frequency: x.frequency, visit_days: x.visit_days ?? [], cycle_start: x.cycle_start, month_week: x.month_week }, date));
  if (!routes.length) return NextResponse.json({ date, routes: [] });
  const ids = routes.map((x: { id: string }) => x.id);
  const [cs, vs] = await Promise.all([
    sb.from("customers").select("id,name,phone,owner,route_id,area:areas(name)").in("route_id", ids).eq("status", "active").eq("is_walk_in", false).order("name").limit(1500),
    sb.from("visits").select("customer_id,outcome,created_at").eq("visit_date", date).in("route_id", ids).order("created_at", { ascending: false }),
  ]);
  const err = cs.error ?? vs.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const outcome = new Map<string, string>();
  for (const v of vs.data ?? []) if (!outcome.has(v.customer_id)) outcome.set(v.customer_id, v.outcome);
  return NextResponse.json({
    date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routes: routes.map((x: any) => ({
      id: x.id, name: x.name, code: x.code, frequency: x.frequency, salesman: one(x.salesman),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customers: (cs.data ?? []).filter((c: any) => c.route_id === x.id).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, owner: c.owner, area: one(c.area)?.name ?? "", outcome: outcome.get(c.id) ?? null })),
    })),
  });
}
