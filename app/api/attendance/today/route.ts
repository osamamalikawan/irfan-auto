import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";

/** The signed-in salesman's attendance today: { attendance: row | null, on_duty }. The app uses this to show Start / End work. */
export async function GET() {
  const a = await authorize("attendance.mark");
  if (a.error) return a.error;
  const { data, error } = await db().from("attendance").select("*").eq("user_id", a.user.id).eq("work_date", todayPk()).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attendance: data, on_duty: !!data && !data.check_out_at });
}
