import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { dbError } from "@/lib/sql-error";

/** Collect money from a customer. Body: { customer_id, amount, idem_key? } */
export async function POST(req: NextRequest) {
  const a = await authorize("payments.receive");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.customer_id) return NextResponse.json({ error: "Choose a customer." }, { status: 400 });
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine) {
    const c = await sb.from("customers").select("route_id").eq("id", b.customer_id).maybeSingle();
    if (!c.data?.route_id || !mine.includes(c.data.route_id)) return NextResponse.json({ error: "That customer is not on your routes." }, { status: 403 });
  }
  const { data, error } = await sb.rpc("collect_payment", {
    p_customer: b.customer_id, p_amount: Number(b.amount), p_idem: b.idem_key ? String(b.idem_key) : null, p_user: a.user.id,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
