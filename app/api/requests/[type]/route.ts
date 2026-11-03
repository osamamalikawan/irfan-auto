import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { REQ_TYPES, STATUSES, createOrderRequest, createPaymentRequest, createReturnRequest, isReqType } from "@/lib/requests";
import { isUuid } from "@/lib/field";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ type: string }> };

/** /api/requests/orders | payments | returns
 *  ?status=pending|approved|rejected|cancelled|all&salesman=<id>&customer=<id>&offset=&limit=
 *  The office (requests.approve) sees everyone's (default: pending); a salesman sees only his own (default: all). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { type } = await params;
  if (!isReqType(type)) return NextResponse.json({ error: "Unknown request type." }, { status: 404 });
  const cfg = REQ_TYPES[type];
  const a = await authorize(cfg.perm, "requests.approve");
  if (a.error) return a.error;
  const approver = hasPerm(a.user, "requests.approve");
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  let q = db().from(cfg.table).select(cfg.select, { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (!approver) q = q.eq("salesman_id", a.user.id);
  else if (isUuid(sp.get("salesman"))) q = q.eq("salesman_id", sp.get("salesman")!);
  if (isUuid(sp.get("customer"))) q = q.eq("customer_id", sp.get("customer")!);
  const st = sp.get("status") ?? (approver ? "pending" : "all");
  if (STATUSES.includes(st)) q = q.eq("status", st);
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], total: count ?? 0 });
}

/** Salesman files a request. The body depends on the type: see lib/requests.ts. Nothing touches stock or the ledger until the office approves. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { type } = await params;
  if (!isReqType(type)) return NextResponse.json({ error: "Unknown request type." }, { status: 404 });
  const a = await authorize(REQ_TYPES[type].perm);
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });
  const sb = db();
  if (type === "orders") return createOrderRequest(sb, a.user, b);
  if (type === "payments") return createPaymentRequest(sb, a.user, b);
  return createReturnRequest(sb, a.user, b);
}
