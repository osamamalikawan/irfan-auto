import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { pinError } from "@/lib/pin";

/** Change your own PIN. Body: { current, next } */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = await req.json().catch(() => null);
  const current = String(b?.current ?? ""), next = String(b?.next ?? "");
  const bad = pinError(next);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (next === current) return NextResponse.json({ error: "The new PIN must be different." }, { status: 400 });

  const sb = db();
  const { data: u } = await sb.from("app_users").select("pin_hash").eq("id", user.id).single();
  if (!u || !(await bcrypt.compare(current, u.pin_hash))) return NextResponse.json({ error: "Your current PIN is wrong." }, { status: 400 });
  const { error } = await sb.from("app_users").update({ pin_hash: await bcrypt.hash(next, 10), must_change_pin: false }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
