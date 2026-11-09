import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { invoiceByKey } from "@/lib/offline-pack";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One invoice of a customer on the salesman's routes, by id or by number (INV-0020): lines, totals, payments, what was returned. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This is for salesmen." }, { status: 403 });
  const { id } = await params;
  const sb = db();
  try {
    const r = await invoiceByKey(sb, decodeURIComponent(id));
    const mine = await allowedRouteIds(sb, a.user);
    if (!r || (mine && !(r.route_id && mine.includes(r.route_id)))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ doc: r.doc });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
