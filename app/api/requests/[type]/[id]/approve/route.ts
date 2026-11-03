import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";
import { isReqType } from "@/lib/requests";
import { isUuid, optNum } from "@/lib/field";

type Ctx = { params: Promise<{ type: string; id: string }> };

/** Office approves a request; the invoice / payment / return is created in the same database step.
 *  Every field is optional: send only what the office changed.
 *  orders:   { lines?: [{ product_id, qty, price?, disc_pct?, location_id? }], discount?, bilti?, local_charges?, remarks? }
 *  payments: { amount?, method_id? }
 *  returns:  { lines?: [{ item_id, qty }], damaged? }
 *  A second approve of the same request returns the same result and changes nothing. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { type, id } = await params;
  if (!isReqType(type) || !isUuid(id)) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const a = await authorize("requests.approve");
  if (a.error) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const sb = db();

  if (type === "orders") {
    let lines: unknown[] | null = null;
    if (Array.isArray(b.lines)) {
      lines = (b.lines as Record<string, unknown>[]).map((l) => ({
        product_id: l.product_id, qty: Number(l.qty), price: optNum(l.price), disc_pct: optNum(l.disc_pct), location_id: l.location_id || null,
      }));
      if (!lines.length) return NextResponse.json({ error: "Add at least one item." }, { status: 400 });
    }
    const { data, error } = await sb.rpc("approve_order_request", {
      p_req: id, p_user: a.user.id, p_lines: lines, p_discount: optNum(b.discount), p_bilti: optNum(b.bilti), p_local: optNum(b.local_charges),
      p_remarks: b.remarks === undefined || b.remarks === null ? null : String(b.remarks).slice(0, 500),
      p_can_discount: hasPerm(a.user, "sales.discount"), p_allowed: a.user.locationIds,
    });
    if (error) return dbError(error);
    return NextResponse.json({ ok: true, sale_id: data });
  }

  if (type === "payments") {
    const m = b.method_id ? String(b.method_id) : null;
    if (m && !isUuid(m)) return NextResponse.json({ error: "Choose a valid payment method." }, { status: 400 });
    const { data, error } = await sb.rpc("approve_payment_request", { p_req: id, p_user: a.user.id, p_amount: optNum(b.amount), p_method: m });
    if (error) return dbError(error);
    return NextResponse.json({ ok: true, payment_id: data });
  }

  let lines: unknown[] | null = null;
  if (Array.isArray(b.lines)) {
    lines = (b.lines as Record<string, unknown>[]).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })).filter((l) => l.qty > 0);
    if (!lines.length) return NextResponse.json({ error: "Choose the items that came back." }, { status: 400 });
  }
  const { data, error } = await sb.rpc("approve_return_request", { p_req: id, p_user: a.user.id, p_lines: lines, p_damaged: typeof b.damaged === "boolean" ? b.damaged : null });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, return_id: data });
}
