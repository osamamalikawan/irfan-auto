import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanDate, cleanFreq, cleanMonthWeek } from "@/lib/schedule";
import { cleanDays } from "@/lib/days";

type Ctx = { params: Promise<{ id: string }> };

/** Change when a route is visited. Body: { frequency, visit_days, cycle_start?, month_week? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("planner.edit", "routes.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const frequency = cleanFreq(b.frequency);
  const days = cleanDays(b.visit_days);
  if (frequency === "fortnightly" && !cleanDate(b.cycle_start)) return NextResponse.json({ error: "Choose a date in the first visit week." }, { status: 400 });
  const patch = {
    frequency, visit_days: days,
    cycle_start: frequency === "fortnightly" ? cleanDate(b.cycle_start) : null,
    month_week: frequency === "monthly" ? cleanMonthWeek(b.month_week) ?? 1 : null,
  };
  const { error } = await db().from("routes").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
