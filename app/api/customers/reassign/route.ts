import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

/** Move customers to another route. Body: { ids: string[], route_id }. History keeps the old route. */
export async function POST(req: NextRequest) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.ids) ? [...new Set<string>(b.ids.map(String))].slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "Choose at least one customer." }, { status: 400 });
  const sb = db();
  const route = await sb.from("routes").select("id").eq("id", String(b?.route_id ?? "")).maybeSingle();
  if (!route.data) return NextResponse.json({ error: "Choose a route." }, { status: 400 });
  const routeId: string = route.data.id;

  const cur = await sb.from("customers").select("id,route_id,is_walk_in").in("id", ids);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  const move = (cur.data ?? [])
    .filter((c: { route_id: string | null; is_walk_in: boolean }) => !c.is_walk_in && c.route_id !== routeId)
    .map((c: { id: string }) => c.id);
  if (!move.length) return NextResponse.json({ moved: 0 });

  const today = new Date().toISOString().slice(0, 10);
  const steps = [
    await sb.from("customer_route_history").update({ to_date: today }).in("customer_id", move).is("to_date", null),
    await sb.from("customer_route_history").insert(move.map((customer_id: string) => ({ customer_id, route_id: routeId, from_date: today }))),
    await sb.from("customers").update({ route_id: routeId, updated_at: new Date().toISOString() }).in("id", move),
  ];
  const bad = steps.find((s) => s.error);
  if (bad?.error) return NextResponse.json({ error: bad.error.message }, { status: 500 });
  return NextResponse.json({ moved: move.length });
}