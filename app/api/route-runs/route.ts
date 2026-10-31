import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { addDays, cleanDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** ?from=&to=  completed routes with what happened on them */
export async function GET(req: NextRequest) {
  const a = await authorize("planner.edit", "visits.record", "routes.manage", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const from = cleanDate(sp.get("from")) ?? todayPk();
  let to = cleanDate(sp.get("to")) ?? from;
  if (to > addDays(from, 92)) to = addDays(from, 92);
  const sb = db();
  let q = sb.from("route_runs").select("id,route_id,run_date,planned,fuel_cost,note,completed_at,route:routes(name,code),salesman:app_users!route_runs_salesman_id_fkey(id,name)")
    .gte("run_date", from).lte("run_date", to).order("run_date", { ascending: false }).order("completed_at", { ascending: false }).limit(300);
  if (a.user.ownOnly) q = q.eq("salesman_id", a.user.id);
  const runs = await q;
  if (runs.error) return NextResponse.json({ error: runs.error.message }, { status: 500 });
  const rows = runs.data ?? [];
  if (!rows.length) return NextResponse.json({ items: [] });
  const routeIds = [...new Set(rows.map((r: { route_id: string }) => r.route_id))];
  const [vs, ss, ps] = await Promise.all([
    sb.from("visits").select("customer_id,route_id,visit_date,outcome").in("route_id", routeIds).gte("visit_date", from).lte("visit_date", to).limit(20000),
    sb.from("sales").select("route_id,sale_date,total,bilti").in("route_id", routeIds).eq("status", "confirmed").gte("sale_date", from).lte("sale_date", to).limit(20000),
    sb.from("payments").select("route_id,pay_date,amount").in("route_id", routeIds).eq("reversed", false).gte("pay_date", from).lte("pay_date", to).limit(20000),
  ]);
  const err = vs.error ?? ss.error ?? ps.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const visited = new Map<string, Set<string>>(), productive = new Map<string, number>(), sales = new Map<string, number>(), coll = new Map<string, number>();
  for (const v of vs.data ?? []) {
    const k = v.route_id + "|" + v.visit_date;
    (visited.get(k) ?? visited.set(k, new Set()).get(k)!).add(v.customer_id);
    if (v.outcome === "Order placed" || v.outcome === "Payment collected") productive.set(k, (productive.get(k) ?? 0) + 1);
  }
  for (const s of ss.data ?? []) { const k = s.route_id + "|" + s.sale_date; sales.set(k, (sales.get(k) ?? 0) + Number(s.total) - Number(s.bilti)); }
  for (const p of ps.data ?? []) { const k = p.route_id + "|" + p.pay_date; coll.set(k, (coll.get(k) ?? 0) + Number(p.amount)); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: rows.map((r: any) => {
    const k = r.route_id + "|" + r.run_date;
    return { id: r.id, route_id: r.route_id, date: r.run_date, route: one(r.route)?.name ?? "", code: one(r.route)?.code ?? "", salesman: one(r.salesman)?.name ?? "", planned: r.planned,
      visited: visited.get(k)?.size ?? 0, productive: productive.get(k) ?? 0, sales: sales.get(k) ?? 0, collections: coll.get(k) ?? 0, fuel: Number(r.fuel_cost), note: r.note };
  }) });
}
