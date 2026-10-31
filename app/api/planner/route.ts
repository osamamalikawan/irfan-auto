import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const PLANNER_READERS = ["planner.edit", "visits.record", "routes.manage", "reports.view"];

/** Routes with their schedule, and what the plan does not cover yet. */
export async function GET(_req: NextRequest) {
  const a = await authorize(...PLANNER_READERS);
  if (a.error) return a.error;
  const sb = db();
  let rq = sb.from("routes").select("id,name,code,salesman_id,visit_days,frequency,cycle_start,month_week,salesman:app_users(id,name)").eq("active", true).order("name");
  if (a.user.ownOnly) rq = rq.eq("salesman_id", a.user.id);
  const [routes, counts] = await Promise.all([rq, sb.rpc("route_customer_counts")]);
  const err = routes.error ?? counts.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const n = new Map<string, number>((counts.data ?? []).map((c: { route_id: string; n: number }) => [c.route_id, Number(c.n)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (routes.data ?? []).map((r: any) => ({ ...r, salesman: one(r.salesman), customers: n.get(r.id) ?? 0 }));

  let coverage = null;
  if (!a.user.ownOnly) {
    const [areas, ra, ac, noRoute] = await Promise.all([
      sb.from("areas").select("id,name,city:cities(name)"),
      sb.from("route_areas").select("area_id"),
      sb.rpc("area_customer_counts"),
      sb.from("customers").select("id,name", { count: "exact" }).eq("status", "active").eq("is_walk_in", false).is("route_id", null).order("name").limit(12),
    ]);
    const err2 = areas.error ?? ra.error ?? ac.error ?? noRoute.error;
    if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });
    const covered = new Set((ra.data ?? []).map((x: { area_id: string }) => x.area_id));
    const cnt = new Map<string, number>((ac.data ?? []).map((c: { area_id: string; n: number }) => [c.area_id, Number(c.n)]));
    coverage = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areasNoRoute: (areas.data ?? []).filter((x: any) => !covered.has(x.id)).map((x: any) => ({ id: x.id, name: x.name, city: one(x.city)?.name ?? "", customers: cnt.get(x.id) ?? 0 })),
      customersNoRoute: { total: noRoute.count ?? 0, sample: noRoute.data ?? [] },
    };
  }
  return NextResponse.json({ routes: list, coverage });
}
