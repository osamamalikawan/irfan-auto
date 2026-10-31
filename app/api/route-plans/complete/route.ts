import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanDate } from "@/lib/schedule";
import { dbError } from "@/lib/sql-error";

/** Mark a route completed for a date. Body: { route_id, date?, fuel_cost?, note? } */
export async function POST(req: NextRequest) {
  const a = await authorize("routes.manage", "visits.record");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.route_id) return NextResponse.json({ error: "Choose a route." }, { status: 400 });
  const sb = db();
  if (a.user.ownOnly) {
    const r = await sb.from("routes").select("salesman_id").eq("id", b.route_id).maybeSingle();
    if (!r.data || r.data.salesman_id !== a.user.id) return NextResponse.json({ error: "That route is not yours." }, { status: 403 });
  }
  const { data, error } = await sb.rpc("complete_route", { p_route: b.route_id, p_date: cleanDate(b.date), p_fuel: Number(b.fuel_cost) || 0, p_note: String(b.note ?? "").slice(0, 300), p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
