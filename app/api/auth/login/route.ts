import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { setSessionCookie, signSession } from "@/lib/auth";

const MAX_TRIES = 5;
const LOCK_MINUTES = 10;

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const userId = String(b?.userId ?? "");
  const pin = String(b?.pin ?? "");
  if (!userId || !pin) return NextResponse.json({ error: "Choose your name and enter your PIN." }, { status: 400 });

  try {
    const sb = db();
    const { data: u } = await sb.from("app_users")
      .select("id,pin_hash,active,failed_attempts,locked_until,must_change_pin").eq("id", userId).maybeSingle();
    if (!u || !u.active) return NextResponse.json({ error: "Wrong name or PIN." }, { status: 401 });

    if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json({ error: "Too many wrong PINs. Try again in " + mins + " minute" + (mins === 1 ? "" : "s") + ", or ask an administrator to unlock you." }, { status: 429 });
    }

    if (!(await bcrypt.compare(pin, u.pin_hash))) {
      const f = (u.failed_attempts ?? 0) + 1;
      const lock = f >= MAX_TRIES;
      await sb.from("app_users").update({
        failed_attempts: lock ? 0 : f,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      }).eq("id", u.id);
      return NextResponse.json({ error: lock ? "Too many wrong PINs. Locked for " + LOCK_MINUTES + " minutes." : "Wrong name or PIN." }, { status: 401 });
    }

    await sb.from("app_users").update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", u.id);
    const res = NextResponse.json({ ok: true, mustChangePin: !!u.must_change_pin });
    setSessionCookie(res, await signSession(u.id));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
