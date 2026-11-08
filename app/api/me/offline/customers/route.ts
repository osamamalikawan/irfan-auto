import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { snapshotCustomer } from "@/lib/offline-pack";

export const dynamic = "force-dynamic";

/** ?offset=0&limit=10  Account details of the next customers on his routes, for offline use:
 *  { items: [{ customer_id, balance, credit_limit, unpaid, rows, invoices }], total, next_offset }. The phone asks page by page. */
export async function GET(req: NextRequest) {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This is for salesmen." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 10, 1), 20);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const sb = db();
  try {
    const list = await sb.rpc("salesman_customers", { p_user: a.user.id });
    if (list.error) throw new Error(list.error.message);
    const all = (list.data ?? []) as { id: string; credit_limit: number }[];
    const items = await Promise.all(all.slice(offset, offset + limit).map((c) => snapshotCustomer(sb, { id: c.id, credit_limit: Number(c.credit_limit) || 0 })));
    return NextResponse.json({ items, total: all.length, next_offset: offset + limit < all.length ? offset + limit : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
