import type { db } from "./supabase";
import type { SessionUser } from "./permissions";
import { DEFAULT_THRESHOLDS, areaTargets, daysBetween, metric, prorate, rangeOf, type Metric, type Thresholds } from "./targets";

type SB = ReturnType<typeof db>;
export const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function getThresholds(sb: SB): Promise<Thresholds> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "thresholds").maybeSingle();
  const v = data?.value as Partial<Thresholds> | undefined;
  return v && Number(v.red) > 0 && Number(v.green) > Number(v.red) ? { red: Number(v.red), green: Number(v.green) } : DEFAULT_THRESHOLDS;
}

export type PerfRow = { id: string; name: string; sub: string; sales: Metric; collection: Metric; visits: Metric; monthly: { sales: number; collection: number; visits: number } };

/** Sales, collections and visits against pro-rated monthly targets, per salesman, route or area. */
export async function computePerformance(sb: SB, user: SessionUser, o: { range: string; from: string | null; to: string | null; group: string }) {
  const [from, to] = rangeOf(o.range, o.from, o.to, todayPk());
  const days = daysBetween(from, to);
  const group = ["route", "area"].includes(o.group) ? o.group : "salesman";
  const th = await getThresholds(sb);

  const actual = await sb.rpc("team_actuals", { p_from: from, p_to: to, p_group: group });
  if (actual.error) throw new Error(actual.error.message);
  const act = new Map<string, { sales: number; collection: number; visits: number }>(
    (actual.data ?? []).map((r: { entity_id: string; sales: number; collection: number; visits: number }) => [r.entity_id, { sales: Number(r.sales), collection: Number(r.collection), visits: Number(r.visits) }]));

  type Ent = { id: string; name: string; sub: string; t: { sales: number; collection: number; visits: number } };
  let ents: Ent[] = [];
  if (group === "salesman") {
    const r = await sb.from("app_users").select("id,name,target_sales,target_collection,target_visits").eq("active", true).eq("is_salesman", true).order("name");
    if (r.error) throw new Error(r.error.message);
    ents = (r.data ?? []).map((u: { id: string; name: string; target_sales: number; target_collection: number; target_visits: number }) => ({ id: u.id, name: u.name, sub: "", t: { sales: Number(u.target_sales), collection: Number(u.target_collection), visits: Number(u.target_visits) } }));
    if (user.ownOnly) ents = ents.filter((e) => e.id === user.id);
  } else {
    const rr = await sb.from("routes").select("id,name,code,salesman_id,target_sales,target_collection,target_visits").eq("active", true).order("name");
    if (rr.error) throw new Error(rr.error.message);
    let routes = rr.data ?? [];
    if (user.ownOnly) routes = routes.filter((r: { salesman_id: string | null }) => r.salesman_id === user.id);
    if (group === "route") {
      ents = routes.map((r: { id: string; name: string; code: string | null; target_sales: number; target_collection: number; target_visits: number }) => ({ id: r.id, name: r.name, sub: r.code ?? "", t: { sales: Number(r.target_sales), collection: Number(r.target_collection), visits: Number(r.target_visits) } }));
    } else {
      const [ra, areas] = await Promise.all([sb.from("route_areas").select("route_id,area_id"), sb.from("areas").select("id,name,city:cities(name)").order("name")]);
      if (ra.error ?? areas.error) throw new Error((ra.error ?? areas.error)!.message);
      const ids = new Set(routes.map((r: { id: string }) => r.id));
      const links = (ra.data ?? []).filter((x: { route_id: string }) => ids.size && ids.has(x.route_id) || !user.ownOnly);
      const tg = areaTargets(rr.data ?? [], links);
      const keep = (id: string) => !user.ownOnly || tg.has(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ents = (areas.data ?? []).filter((a: any) => keep(a.id)).map((a: any) => ({ id: a.id, name: a.name, sub: one(a.city)?.name ?? "", t: tg.get(a.id) ?? { sales: 0, collection: 0, visits: 0 } }));
    }
  }

  const rows: PerfRow[] = ents.map((e) => {
    const a = act.get(e.id) ?? { sales: 0, collection: 0, visits: 0 };
    return {
      id: e.id, name: e.name, sub: e.sub, monthly: e.t,
      sales: metric(prorate(e.t.sales, days), a.sales, th), collection: metric(prorate(e.t.collection, days), a.collection, th), visits: metric(prorate(e.t.visits, days), a.visits, th),
    };
  });
  return { from, to, days, group, thresholds: th, rows };
}
