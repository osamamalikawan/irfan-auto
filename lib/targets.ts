// Targets are set per month. For any period they are pro-rated by days (days / 30), like the original prototype.

export type Thresholds = { red: number; green: number };
export const DEFAULT_THRESHOLDS: Thresholds = { red: 70, green: 100 };
export type Metric = { target: number; actual: number; remaining: number; variance: number; pct: number | null; status: "none" | "red" | "amber" | "green"; label: string };

const DAY_MS = 86400000;
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / DAY_MS) + 1;
const addDays = (s: string, n: number) => new Date(new Date(s + "T12:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);

export function rangeOf(range: string, from: string | null, to: string | null, today: string): [string, string] {
  if (range === "today") return [today, today];
  if (range === "week") { const i = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; return [addDays(today, -i), today]; }
  if (range === "month") return [today.slice(0, 8) + "01", today];
  const f = from && /^\d{4}-\d\d-\d\d$/.test(from) ? from : today, t = to && /^\d{4}-\d\d-\d\d$/.test(to) ? to : f;
  return t < f ? [f, f] : [f, t];
}

export const prorate = (monthly: number, days: number) => Math.round((Number(monthly) || 0) * days / 30);

export function metric(target: number, actual: number, th: Thresholds = DEFAULT_THRESHOLDS): Metric {
  const none = !target;
  const pct = none ? null : (actual / target) * 100;
  return {
    target, actual, remaining: Math.max(target - actual, 0), variance: actual - target, pct: pct === null ? null : Math.round(pct * 10) / 10,
    status: pct === null ? "none" : pct < th.red ? "red" : pct < th.green ? "amber" : "green",
    label: pct === null ? "No target" : pct < th.red ? "Below " + th.red + "%" : pct < th.green ? "Near target" : "Target met",
  };
}

type T = { sales: number; collection: number; visits: number };
/** An area has no target of its own: each route's target is shared equally between the areas on that route. */
export function areaTargets(routes: { id: string; target_sales: number; target_collection: number; target_visits: number }[], routeAreas: { route_id: string; area_id: string }[]) {
  const out = new Map<string, T>();
  const perRoute = new Map<string, string[]>();
  for (const ra of routeAreas) perRoute.set(ra.route_id, [...(perRoute.get(ra.route_id) ?? []), ra.area_id]);
  for (const r of routes) {
    const areas = perRoute.get(r.id) ?? [];
    for (const a of areas) {
      const t = out.get(a) ?? { sales: 0, collection: 0, visits: 0 };
      t.sales += Number(r.target_sales) / areas.length; t.collection += Number(r.target_collection) / areas.length; t.visits += Number(r.target_visits) / areas.length;
      out.set(a, t);
    }
  }
  return out;
}
