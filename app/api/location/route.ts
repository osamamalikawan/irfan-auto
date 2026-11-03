import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { addDays } from "@/lib/schedule";
import { cleanAcc, cleanCoords, todayPk } from "@/lib/field";

/** The phone's position while on duty. Body: { pings: [{ lat, lng, accuracy?, ts (ISO text or epoch ms), battery? }] } (up to 200, so a
 *  phone that was offline can upload everything at once). Points outside a checked-in shift are ignored.
 *  Answer: { accepted, ignored, on_duty }. When on_duty is false the app should stop tracking. */
export async function POST(req: NextRequest) {
  const a = await authorize("attendance.mark");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(b?.pings) ? b.pings : [];
  if (!raw.length) return NextResponse.json({ error: "No locations sent." }, { status: 400 });
  if (raw.length > 200) return NextResponse.json({ error: "Send at most 200 locations at a time." }, { status: 400 });

  const sb = db();
  const today = todayPk();
  const { data: shifts, error } = await sb.from("attendance").select("id,work_date,check_in_at,check_out_at")
    .eq("user_id", a.user.id).gte("work_date", addDays(today, -2)).order("check_in_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Shift = { id: string; work_date: string; check_in_at: string; check_out_at: string | null };
  const list = (shifts ?? []) as Shift[];
  const wins = list.map((s) => ({ id: s.id, from: Date.parse(s.check_in_at) - 60_000, to: s.check_out_at ? Date.parse(s.check_out_at) + 60_000 : Infinity }));
  const onDuty = list.some((s) => s.work_date === today && !s.check_out_at);

  const now = Date.now();
  const rows: Record<string, unknown>[] = [];
  for (const x of raw) {
    const p = (x ?? {}) as Record<string, unknown>;
    const pos = cleanCoords(p.lat, p.lng);
    const t = typeof p.ts === "number" ? p.ts : Date.parse(String(p.ts ?? ""));
    if (!pos || !Number.isFinite(t) || t > now + 5 * 60_000 || t < now - 48 * 3600_000) continue;
    const w = wins.find((s) => t >= s.from && t <= s.to);
    if (!w) continue;
    const bat = Number(p.battery);
    rows.push({
      user_id: a.user.id, attendance_id: w.id, recorded_at: new Date(t).toISOString(), lat: pos.lat, lng: pos.lng,
      accuracy: cleanAcc(p.accuracy), battery: Number.isFinite(bat) && bat >= 0 && bat <= 100 ? Math.round(bat) : null,
    });
  }
  if (rows.length) {
    const { error: e2 } = await sb.from("location_pings").upsert(rows, { onConflict: "user_id,recorded_at", ignoreDuplicates: true });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ accepted: rows.length, ignored: raw.length - rows.length, on_duty: onDuty });
}
