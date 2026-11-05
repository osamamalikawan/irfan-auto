import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";

/** Every active salesman with his last known position, how old it is, battery, and whether he is on duty today. */
export async function GET() {
  const a = await authorize("tracking.view");
  if (a.error) return a.error;
  const sb = db();
  const { data, error } = await sb.rpc("salesman_locations");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // is a salesman's location turned off right now? (his latest event today is an "off")
  const ev = await sb.from("location_events").select("user_id,kind,at").gte("at", todayPk() + "T00:00:00+05:00").order("at", { ascending: false }).limit(2000);
  const latest = new Map<string, { kind: string; at: string }>();
  for (const e of (ev.error ? [] : ev.data ?? []) as { user_id: string; kind: string; at: string }[]) if (!latest.has(e.user_id)) latest.set(e.user_id, e);
  const items = ((data ?? []) as { user_id: string }[]).map((l) => {
    const e = latest.get(l.user_id);
    const off = e && e.kind.endsWith("_off") ? e : null;
    return { ...l, location_issue: off?.kind ?? null, issue_since: off?.at ?? null };
  });
  return NextResponse.json({ items, now: new Date().toISOString() });
}
