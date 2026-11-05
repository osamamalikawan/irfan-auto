import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { addDays } from "@/lib/schedule";
import { isDate, isUuid, one, todayPk } from "@/lib/field";
import { isEventKind, pairEvents, type EventRow } from "@/lib/location-events";

export const dynamic = "force-dynamic";

/** The phone reports that location went off / came back. Body: { events: [{ type: "location_off"|"location_on"|"permission_off"|"permission_on", ts }] }
 *  (up to 50; ts = epoch ms). Events outside a checked-in shift are ignored. Answer: { accepted, ignored }. */
export async function POST(req: NextRequest) {
  const a = await authorize("attendance.mark");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(b?.events) ? b.events : [];
  if (!raw.length) return NextResponse.json({ error: "No events sent." }, { status: 400 });
  if (raw.length > 50) return NextResponse.json({ error: "Send at most 50 events at a time." }, { status: 400 });

  const sb = db();
  const { data: shifts, error } = await sb.from("attendance").select("id,check_in_at,check_out_at")
    .eq("user_id", a.user.id).gte("work_date", addDays(todayPk(), -2)).order("check_in_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Shift = { id: string; check_in_at: string; check_out_at: string | null };
  const wins = ((shifts ?? []) as Shift[]).map((s) => ({ id: s.id, from: Date.parse(s.check_in_at) - 60_000, to: s.check_out_at ? Date.parse(s.check_out_at) + 60_000 : Infinity }));

  const now = Date.now();
  const rows: Record<string, unknown>[] = [];
  for (const x of raw) {
    const e = (x ?? {}) as Record<string, unknown>;
    const t = Number(e.ts);
    if (!isEventKind(e.type) || !Number.isFinite(t) || t > now + 5 * 60_000 || t < now - 48 * 3600_000) continue;
    const w = wins.find((s) => t >= s.from && t <= s.to);
    if (!w) continue;
    rows.push({ user_id: a.user.id, attendance_id: w.id, kind: e.type, at: new Date(t).toISOString() });
  }
  if (rows.length) {
    const { error: e2 } = await sb.from("location_events").upsert(rows, { onConflict: "user_id,at,kind", ignoreDuplicates: true });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ accepted: rows.length, ignored: raw.length - rows.length });
}

/** Office: ?from=YYYY-MM-DD&to=YYYY-MM-DD&user=<id> (default: today, everyone; at most 31 days).
 *  { periods: [{ user_id, user_name, date, kind: "location"|"permission", from, to (null = still off), minutes, ongoing }] } */
export async function GET(req: NextRequest) {
  const a = await authorize("tracking.view", "attendance.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  const from = isDate(sp.get("from")) ? sp.get("from")! : today;
  let to = isDate(sp.get("to")) && sp.get("to")! >= from ? sp.get("to")! : from;
  if (to > addDays(from, 31)) to = addDays(from, 31);

  const sb = db();
  let q = sb.from("location_events").select("user_id,attendance_id,kind,at,user:app_users(name)")
    .gte("at", from + "T00:00:00+05:00").lt("at", addDays(to, 1) + "T00:00:00+05:00").order("at").limit(5000);
  if (isUuid(sp.get("user"))) q = q.eq("user_id", sp.get("user")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: EventRow[] = (data ?? []).map((r: any) => ({ user_id: r.user_id, attendance_id: r.attendance_id, kind: r.kind, at: r.at, user_name: one<{ name: string }>(r.user)?.name ?? "" }));
  const ids = [...new Set(rows.map((r) => r.attendance_id).filter((x): x is string => !!x))];
  const shiftEnd = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const s = await sb.from("attendance").select("id,check_out_at").in("id", ids.slice(i, i + 100));
    for (const r of (s.data ?? []) as { id: string; check_out_at: string | null }[]) shiftEnd.set(r.id, r.check_out_at);
  }
  return NextResponse.json({ periods: pairEvents(rows, shiftEnd) });
}
