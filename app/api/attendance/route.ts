import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";
import { cleanAcc, cleanAt, cleanCoords, isDate, one, todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD&user=<id>  (default: today). Office (attendance.view) sees everyone, a salesman only himself. */
export async function GET(req: NextRequest) {
  const a = await authorize("attendance.view", "attendance.mark");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  const from = isDate(sp.get("from")) ? sp.get("from")! : today;
  const to = isDate(sp.get("to")) ? sp.get("to")! : from > today ? from : today;
  let q = db().from("attendance")
    .select("id,user_id,work_date,check_in_at,in_lat,in_lng,in_accuracy,check_out_at,out_lat,out_lng,out_accuracy,note,user:app_users(name)")
    .gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: false }).order("check_in_at", { ascending: false }).limit(500);
  if (!hasPerm(a.user, "attendance.view")) q = q.eq("user_id", a.user.id);
  else if (sp.get("user")) q = q.eq("user_id", sp.get("user")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let salesmen: { id: string; name: string }[] = [];
  if (hasPerm(a.user, "attendance.view")) {
    const s = await db().from("app_users").select("id,name").eq("is_salesman", true).eq("active", true).order("name");
    salesmen = (s.data ?? []) as { id: string; name: string }[];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((r: any) => ({ ...r, user: undefined, user_name: one<{ name: string }>(r.user)?.name ?? "" })), salesmen });
}

/** Start work. Body: { lat, lng, accuracy? }. Saves where and when; also the first point of the day's trail. */
export async function POST(req: NextRequest) {
  const a = await authorize("attendance.mark");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const pos = cleanCoords(b?.lat, b?.lng);
  if (!pos) return NextResponse.json({ error: "Your location could not be read. Turn on GPS and try again." }, { status: 400 });
  const sb = db();
  const at = cleanAt(b?.at); // sent later from an offline phone: the time he really started
  const { data, error } = await sb.rpc("attendance_check_in", { p_user: a.user.id, p_lat: pos.lat, p_lng: pos.lng, p_acc: cleanAcc(b?.accuracy), p_at: at });
  if (error) return dbError(error);
  const att = data as { id: string };
  await sb.from("location_pings").upsert(
    { user_id: a.user.id, attendance_id: att.id, recorded_at: at ?? new Date().toISOString(), lat: pos.lat, lng: pos.lng, accuracy: cleanAcc(b?.accuracy) },
    { onConflict: "user_id,recorded_at", ignoreDuplicates: true },
  );
  return NextResponse.json({ attendance: att, on_duty: true }, { status: 201 });
}
