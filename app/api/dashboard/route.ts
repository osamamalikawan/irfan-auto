import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { hasAny } from "@/lib/permissions";
import { computePerformance, todayPk } from "@/lib/performance";
import { isVisitDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Everything the home screen shows. Each block is included only if the person may see it. */
export async function GET() {
  const a = await authorize();
  if (a.error) return a.error;
  const u = a.user, sb = db(), today = todayPk();
  const can = (...p: string[]) => hasAny(u, p);
  const mine = await allowedRouteIds(sb, u);       // null = every route
  const out: Record<string, unknown> = { today, name: u.name };
  try {
    if (can("sales.create", "payments.receive", "accounts.edit", "reports.view")) {
      const n = await sb.rpc("dashboard_numbers", { p_day: today, p_routes: mine });
      if (n.error) throw new Error(n.error.message);
      const v = { ...(n.data as Record<string, number>) };
      if (!can("accounts.edit", "reports.view") || u.ownOnly) delete v.money_in_hand;
      if (!can("accounts.edit", "reports.view") && !can("payments.receive")) delete v.receivables;
      out.numbers = v;
    }
    if (can("stock.view", "stock.transfer", "stock.adjust")) {
      const low = await sb.rpc("inventory_list", { p_q: null, p_list: null, p_filter: "low", p_limit: 6, p_offset: 0 });
      if (low.error) throw new Error(low.error.message);
      const rows = (low.data ?? []) as { id: string; name_en: string; on_hand: number; reorder_level: number; unit: string; total: number }[];
      out.low_stock = { total: rows[0] ? Number(rows[0].total) : 0, items: rows.map((r) => ({ id: r.id, name: r.name_en, on_hand: Number(r.on_hand), reorder: Number(r.reorder_level), unit: r.unit })) };
    }
    if (can("sales.create", "payments.receive")) {
      let q = sb.from("sales").select("id,no,customer_name,total,paid,status,created_at").order("created_at", { ascending: false }).limit(6);
      if (mine) q = q.in("route_id", mine.length ? mine : ["00000000-0000-0000-0000-000000000000"]);
      const r = await q;
      if (r.error) throw new Error(r.error.message);
      out.recent_sales = r.data ?? [];
    }
    if (can("reports.view")) {
      const p = await computePerformance(sb, u, { range: "month", from: null, to: null, group: "salesman" });
      out.targets = { from: p.from, to: p.to, rows: p.rows };
    }
    if (can("visits.record", "planner.edit", "routes.manage", "reports.view")) {
      let rq = sb.from("routes").select("id,name,code,salesman_id,visit_days,frequency,cycle_start,month_week").eq("active", true);
      if (u.ownOnly) rq = rq.eq("salesman_id", u.id);
      const [routes, counts] = await Promise.all([rq, sb.rpc("route_customer_counts")]);
      if (routes.error ?? counts.error) throw new Error((routes.error ?? counts.error)!.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todays = (routes.data ?? []).filter((r: any) => isVisitDate({ frequency: r.frequency, visit_days: r.visit_days ?? [], cycle_start: r.cycle_start, month_week: r.month_week }, today));
      const ids = todays.map((r: { id: string }) => r.id);
      const vs = ids.length ? await sb.from("visits").select("customer_id,route_id").eq("visit_date", today).in("route_id", ids) : { data: [] as { customer_id: string; route_id: string }[], error: null };
      if (vs.error) throw new Error(vs.error.message);
      const n = new Map<string, number>((counts.data ?? []).map((c: { route_id: string; n: number }) => [c.route_id, Number(c.n)]));
      const seen = new Map<string, Set<string>>();
      for (const v of vs.data ?? []) (seen.get(v.route_id) ?? seen.set(v.route_id, new Set()).get(v.route_id)!).add(v.customer_id);
      const list = todays.map((r: { id: string; name: string; code: string | null }) => ({ id: r.id, name: r.name, code: r.code, customers: n.get(r.id) ?? 0, visited: seen.get(r.id)?.size ?? 0 }));
      out.visits = { routes: list.length, customers: list.reduce((x: number, r: { customers: number }) => x + r.customers, 0), visited: list.reduce((x: number, r: { visited: number }) => x + r.visited, 0), list };
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json(out);
}
