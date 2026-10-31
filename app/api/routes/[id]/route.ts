import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanDays } from "@/lib/days";
import { cleanDate, cleanFreq, cleanMonthWeek } from "@/lib/schedule";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sb = db();
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Route name is required." }, { status: 400 });
    patch.name = name;
  }
  if (b.code !== undefined) patch.code = String(b.code).trim() || null;
  if (b.salesman_id !== undefined) patch.salesman_id = b.salesman_id || null;
  if (b.list_id !== undefined) patch.list_id = b.list_id || null;
  if (b.visit_days !== undefined) patch.visit_days = cleanDays(b.visit_days);
  if (b.frequency !== undefined) {
    const f = cleanFreq(b.frequency);
    patch.frequency = f;
    patch.cycle_start = f === "fortnightly" ? cleanDate(b.cycle_start) : null;
    patch.month_week = f === "monthly" ? cleanMonthWeek(b.month_week) ?? 1 : null;
  }
  if (b.fuel_cost !== undefined) patch.fuel_cost = Math.max(0, Math.round(Number(b.fuel_cost) || 0));
  if (b.target_sales !== undefined) patch.target_sales = Math.max(0, Number(b.target_sales) || 0);
  if (b.target_collection !== undefined) patch.target_collection = Math.max(0, Number(b.target_collection) || 0);
  if (b.target_visits !== undefined) patch.target_visits = Math.max(0, Math.round(Number(b.target_visits) || 0));
  if (b.active !== undefined) patch.active = !!b.active;
  if (Object.keys(patch).length) {
    const { error } = await sb.from("routes").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.code === "23505" ? "That route name is already used." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  }
  if (Array.isArray(b.area_ids)) {
    const ids: string[] = [...new Set<string>(b.area_ids.map(String))];
    const d = await sb.from("route_areas").delete().eq("route_id", id);
    if (d.error) return NextResponse.json({ error: d.error.message }, { status: 500 });
    if (ids.length) {
      const r = await sb.from("route_areas").insert(ids.map((area_id) => ({ route_id: id, area_id })));
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
