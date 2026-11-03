import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { rangeOf } from "@/lib/targets";
import { cashAccount } from "@/lib/salesman-account";
import { cleanText, isDate, isUuid, todayPk } from "@/lib/field";
import { addDays } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Office (accounts.edit). Without ?user: every salesman's position { items: [{ user_id, name, collected, handed_over, balance }] }.
 *  With ?user=<id>&range=|from=&to= : that salesman's statement (same shape as `cash` in /api/me/account). */
export async function GET(req: NextRequest) {
  const a = await authorize("accounts.edit");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const uid = sp.get("user");
  if (!uid) {
    const { data, error } = await sb.rpc("salesman_cash_balances");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }
  if (!isUuid(uid)) return NextResponse.json({ error: "Salesman not found." }, { status: 404 });
  const [from, to] = rangeOf(sp.get("range") ?? "month", sp.get("from"), sp.get("to"), todayPk());
  try {
    return NextResponse.json(await cashAccount(sb, uid, from, to));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** The office received money from a salesman. Body: { user_id, amount, method_id?, note?, date? (today or up to 31 days back) }.
 *  It cannot be more than he is holding. */
export async function POST(req: NextRequest) {
  const a = await authorize("accounts.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const uid = String(b?.user_id ?? "");
  if (!isUuid(uid)) return NextResponse.json({ error: "Choose the salesman." }, { status: 400 });
  const amount = Math.round(Number(b?.amount) * 100) / 100;
  if (!(amount > 0) || amount > 100_000_000) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const today = todayPk();
  const date = isDate(b?.date) ? b.date : today;
  if (date > today) return NextResponse.json({ error: "The date cannot be in the future." }, { status: 400 });
  if (date < addDays(today, -31)) return NextResponse.json({ error: "Entries older than 31 days cannot be added." }, { status: 400 });

  const sb = db();
  const { data: u } = await sb.from("app_users").select("id,name,cash_start").eq("id", uid).eq("is_salesman", true).eq("active", true).maybeSingle();
  if (!u) return NextResponse.json({ error: "Salesman not found." }, { status: 404 });
  if (date < u.cash_start) return NextResponse.json({ error: "That is before this salesman's account starts (" + u.cash_start + ")." }, { status: 400 });
  let method: { id: string; name: string } | null = null;
  if (b?.method_id) {
    const m = await sb.from("payment_methods").select("id,name").eq("id", String(b.method_id)).maybeSingle();
    if (!m.data) return NextResponse.json({ error: "Choose a valid payment method." }, { status: 400 });
    method = m.data as { id: string; name: string };
  }
  const bal = await sb.rpc("salesman_cash_balance", { p_user: uid, p_to: today });
  if (bal.error) return NextResponse.json({ error: bal.error.message }, { status: 500 });
  const holding = Number(bal.data ?? 0);
  if (amount > holding + 0.005) return NextResponse.json({ error: u.name + " is holding Rs " + holding.toLocaleString("en-PK") + ". You cannot receive more than that." }, { status: 409 });

  const { data, error } = await sb.from("cash_handovers").insert({
    user_id: uid, amount, method_id: method?.id ?? null, method: method?.name ?? null, handed_date: date, note: cleanText(b?.note, 300), created_by: a.user.id,
  }).select("id,no,handed_date,amount").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
