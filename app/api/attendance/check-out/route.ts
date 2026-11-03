import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { cleanAcc, cleanCoords } from "@/lib/field";

/** Finish work. Body: { lat, lng, accuracy? }. */
export async function POST(req: NextRequest) {
  const a = await authorize("attendance.mark");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const pos = cleanCoords(b?.lat, b?.lng);
  if (!pos) return NextResponse.json({ error: "Your location could not be read. Turn on GPS and try again." }, { status: 400 });
  const sb = db();
  const { data, error } = await sb.rpc("attendance_check_out", { p_user: a.user.id, p_lat: pos.lat, p_lng: pos.lng, p_acc: cleanAcc(b?.accuracy) });
  if (error) return dbError(error);
  const att = data as { id: string };
  await sb.from("location_pings").upsert(
    { user_id: a.user.id, attendance_id: att.id, recorded_at: new Date().toISOString(), lat: pos.lat, lng: pos.lng, accuracy: cleanAcc(b?.accuracy) },
    { onConflict: "user_id,recorded_at", ignoreDuplicates: true },
  );
  return NextResponse.json({ attendance: att, on_duty: false });
}
