import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { addDays } from "@/lib/schedule";
import { isDate, isUuid, todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ userId: string }> };

/** ?date=YYYY-MM-DD (default today). One salesman's trail for that day, oldest first. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("tracking.view");
  if (a.error) return a.error;
  const { userId } = await params;
  if (!isUuid(userId)) return NextResponse.json({ error: "Salesman not found." }, { status: 404 });
  const q = req.nextUrl.searchParams.get("date");
  const day = isDate(q) ? q : todayPk();
  const { data, error } = await db().from("location_pings").select("recorded_at,lat,lng,accuracy,battery")
    .eq("user_id", userId).gte("recorded_at", day + "T00:00:00+05:00").lt("recorded_at", addDays(day, 1) + "T00:00:00+05:00")
    .order("recorded_at").limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ date: day, points: data ?? [] });
}
