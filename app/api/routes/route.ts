import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanDays } from "@/lib/days";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await authorize("routes.manage", "customers.view", "customers.edit", "sales.create");
  if (a.error) return a.error;
  const sb = db();
  let q = sb.from("routes")
    .select("id,name,code,salesman_id,list_id,visit_days,fuel_cost,target_sales,target_collection,target_visits,active,salesman:app_users(id,name),route_areas(area:areas(id,name,city:cities(id,name)))")
    .order("name");
  if (a.user.ownOnly) q = q.eq("salesman_id", a.user.id);
  const [routes, counts, sm] = await Promise.all([
    q, sb.rpc("route_customer_counts"),
    sb.from("app_users").select("id,name").eq("active", true).eq("is_salesman", true).order("name"),
  ]);
  const err = routes.error ?? counts.error ?? sm.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const n = new Map<string, number>((counts.data ?? []).map((c: { route_id: string; n: number }) => [c.route_id, Number(c.n)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (routes.data ?? []).map((r: any) => {
    const { route_areas, salesman, ...rest } = r;
    return {
      ...rest, salesman: Array.isArray(salesman) ? salesman[0] ?? null : salesman ?? null, customers: n.get(r.id) ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areas: (route_areas ?? []).map((x: any) => (Array.isArray(x.area) ? x.area[0] : x.area)).filter(Boolean),
    };
  });
  return NextResponse.json({ routes: list, salesmen: sm.data });
}

/** Body: { name, code?, salesman_id?, list_id?, visit_days?, fuel_cost?, target_sales?, target_collection?, target_visits?, area_ids? } */
export async function POST(req: NextRequest) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Route name is required." }, { status: 400 });
  const sb = db();
  const { data, error } = await sb.from("routes").insert({
    name, code: String(b?.code ?? "").trim() || name.slice(0, 3).toUpperCase(),
    salesman_id: b?.salesman_id || null, list_id: b?.list_id || null, visit_days: cleanDays(b?.visit_days),
    fuel_cost: Math.max(0, Math.round(Number(b?.fuel_cost) || 0)),
    target_sales: Math.max(0, Number(b?.target_sales) || 0), target_collection: Math.max(0, Number(b?.target_collection) || 0),
    target_visits: Math.max(0, Math.round(Number(b?.target_visits) || 0)),
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A route called '" + name + "' already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  const ids: string[] = Array.isArray(b?.area_ids) ? [...new Set<string>(b.area_ids.map(String))] : [];
  if (ids.length) {
    const r = await sb.from("route_areas").insert(ids.map((area_id) => ({ route_id: data.id, area_id })));
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
