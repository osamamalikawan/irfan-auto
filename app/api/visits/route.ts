import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { VISIT_OUTCOMES, addDays, cleanDate } from "@/lib/schedule";

const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** Record a customer's response on a route visit.
 *  Body: { customer_id, outcome, notes?, date? (today or up to 31 days back), promise_date?, promise_amount? } */
export async function POST(req: NextRequest) {
  const a = await authorize("visits.record");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!(VISIT_OUTCOMES as readonly string[]).includes(b?.outcome)) return NextResponse.json({ error: "Choose a visit outcome." }, { status: 400 });
  const today = todayPk();
  const date = cleanDate(b?.date) ?? today;
  if (date > today) return NextResponse.json({ error: "A visit cannot be recorded for a future date." }, { status: 400 });
  if (date < addDays(today, -31)) return NextResponse.json({ error: "Visits older than 31 days cannot be recorded." }, { status: 400 });
  const promiseDate = cleanDate(b?.promise_date);
  const promiseAmount = Math.max(0, Number(b?.promise_amount) || 0);
  if (promiseDate && promiseDate < today) return NextResponse.json({ error: "A promise date cannot be in the past." }, { status: 400 });
  if (promiseAmount > 0 && !promiseDate) return NextResponse.json({ error: "Enter the date the customer promised to pay." }, { status: 400 });

  const sb = db();
  const c = await sb.from("customers").select("id,route_id,area_id,status,is_walk_in").eq("id", String(b?.customer_id ?? "")).maybeSingle();
  if (!c.data || c.data.is_walk_in) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(c.data.route_id && mine.includes(c.data.route_id))) return NextResponse.json({ error: "That customer is not on your routes." }, { status: 403 });
  const { error } = await sb.from("visits").insert({
    customer_id: c.data.id, route_id: c.data.route_id, area_id: c.data.area_id, user_id: a.user.id, outcome: b.outcome, visit_date: date,
    notes: String(b?.notes ?? "").trim().slice(0, 300) || null, promise_date: promiseDate, promise_amount: promiseAmount > 0 ? promiseAmount : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
