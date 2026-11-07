import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { isAdmin } from "@/lib/permissions";
import { FULFIL_KEYS, canMoveStatus } from "@/lib/sale-types";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { status: "active" | "packed" | "delivered" | "completed" } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.status");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const status = String(b?.status ?? "");
  if (!FULFIL_KEYS.includes(status)) return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  const sb = db();
  const s = await sb.from("sales").select("id,status,fulfil_status,sale_kind,total,paid,route_id").eq("id", id).maybeSingle();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  const mine = await allowedRouteIds(sb, a.user);
  if (!s.data || (mine && !(s.data.route_id && mine.includes(s.data.route_id)))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (s.data.status !== "confirmed") return NextResponse.json({ error: "A cancelled invoice cannot change status." }, { status: 400 });
  if (status === s.data.fulfil_status) return NextResponse.json({ ok: true, status });
  if (!canMoveStatus(s.data.fulfil_status, status, isAdmin(a.user))) {
    return NextResponse.json({ error: "The status only moves forward. Only an admin can move it back." }, { status: 403 });
  }
  if (s.data.sale_kind === "counter" && status !== "active" && Number(s.data.paid) < Number(s.data.total)) {
    return NextResponse.json({ error: "A counter sale on hold stays Active until it is paid. Receive the payment first." }, { status: 400 });
  }
  const { error } = await sb.from("sales").update({ fulfil_status: status, status_changed_at: new Date().toISOString(), status_changed_by: a.user.id }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
