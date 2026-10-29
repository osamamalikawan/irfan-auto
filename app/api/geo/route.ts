import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const READERS = ["routes.manage", "customers.view", "customers.edit", "sales.create"];

/** Cities with their areas, customer counts and the routes serving each area. */
export async function GET() {
  const a = await authorize(...READERS);
  if (a.error) return a.error;
  const sb = db();
  const [cities, counts, ra] = await Promise.all([
    sb.from("cities").select("id,name,areas(id,name)").order("name"),
    sb.rpc("area_customer_counts"),
    sb.from("route_areas").select("route_id,area_id"),
  ]);
  const err = cities.error ?? counts.error ?? ra.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const n = new Map<string, number>((counts.data ?? []).map((c: { area_id: string; n: number }) => [c.area_id, Number(c.n)]));
  const rts = new Map<string, string[]>();
  for (const r of ra.data ?? []) rts.set(r.area_id, [...(rts.get(r.area_id) ?? []), r.route_id]);
  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cities: (cities.data ?? []).map((c: any) => ({
      id: c.id, name: c.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areas: (c.areas ?? []).sort((x: any, y: any) => x.name.localeCompare(y.name)).map((x: any) => ({ id: x.id, name: x.name, customers: n.get(x.id) ?? 0, route_ids: rts.get(x.id) ?? [] })),
    })),
  });
}

/** Body: { type: "city", name }  or  { type: "area", name, city_id } */
export async function POST(req: NextRequest) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: (b?.type === "area" ? "Area" : "City") + " name is required." }, { status: 400 });
  const sb = db();
  if (b.type === "city") {
    const { error } = await sb.from("cities").insert({ name });
    if (error) return NextResponse.json({ error: error.code === "23505" ? "This city already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (b.type === "area") {
    if (!b.city_id) return NextResponse.json({ error: "Choose the city this area belongs to." }, { status: 400 });
    const { error } = await sb.from("areas").insert({ name, city_id: b.city_id });
    if (error) return NextResponse.json({ error: error.code === "23505" ? "This area already exists in that city." : error.message }, { status: error.code === "23505" ? 409 : 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: "Bad request." }, { status: 400 });
}

/** Rename. Body: { type: "city" | "area", id, name } */
export async function PATCH(req: NextRequest) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name || !b?.id || !["city", "area"].includes(b.type)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await db().from(b.type === "city" ? "cities" : "areas").update({ name }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That name is already used." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
