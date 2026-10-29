import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";

/** ?from=&to=  recent returns */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.return", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [] });
  let q = sb.from("sale_returns").select("id,no,return_date,amount,damaged,reason,created_at,sale:sales(id,no,customer_id,customer_name),lines:sale_return_lines(qty,name),by:app_users!sale_returns_created_by_fkey(name)")
    .order("created_at", { ascending: false }).limit(60);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("from")) q = q.gte("return_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("return_date", sp.get("to")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((r: any) => ({ ...r, sale: one(r.sale), by: one(r.by)?.name ?? "" })) });
}

/** Body: { sale_id, lines: [{ item_id, qty }], damaged?, reason? } */
export async function POST(req: NextRequest) {
  const a = await authorize("sales.return");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.sale_id) return NextResponse.json({ error: "Find the invoice first." }, { status: 400 });
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine) {
    const s = await sb.from("sales").select("route_id").eq("id", b.sale_id).maybeSingle();
    if (!s.data?.route_id || !mine.includes(s.data.route_id)) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const lines = Array.isArray(b.lines) ? b.lines.map((l: { item_id: string; qty: unknown }) => ({ item_id: l.item_id, qty: Number(l.qty) })).filter((l: { qty: number }) => l.qty > 0) : [];
  const { data, error } = await sb.rpc("create_return", { p_sale: b.sale_id, p_lines: lines, p_damaged: !!b.damaged, p_reason: String(b.reason ?? "").slice(0, 300), p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
