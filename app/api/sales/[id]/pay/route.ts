import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { cleanPays } from "@/lib/pays";
import { dbError } from "@/lib/sql-error";

type Ctx = { params: Promise<{ id: string }> };

/** Receive money against one invoice (a held counter sale, or cash on delivery). Body: { payments: [{ method_id, amount }] } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("payments.receive", "sales.create");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const pays = cleanPays(b?.payments);
  if (!pays.length) return NextResponse.json({ error: "Enter an amount and choose how it was received." }, { status: 400 });
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine) {
    const s = await sb.from("sales").select("route_id").eq("id", id).maybeSingle();
    if (!s.data?.route_id || !mine.includes(s.data.route_id)) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const { error } = await sb.rpc("pay_sale", { p_sale: id, p_pays: pays, p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
