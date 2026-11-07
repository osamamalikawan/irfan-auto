import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const FILTERS = ["all", "nosupplier", "nobrand", "nocompany", "nolist", "low"];
const UUID = /^[0-9a-f-]{36}$/i;
const id = (v: string | null) => (v && UUID.test(v) ? v : null);

/** Products of active price lists. ?q=&filter=all|nosupplier|nobrand|nocompany|nolist|low&list=&company=&brand=&supplier=&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize("stock.view", "stock.manage");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const filter = sp.get("filter") ?? "all";
  const { data, error } = await db().rpc("products_page", {
    p_q: (sp.get("q") ?? "").trim() || null,
    p_list: id(sp.get("list")), p_company: id(sp.get("company")), p_brand: id(sp.get("brand")), p_supplier: id(sp.get("supplier")),
    p_filter: FILTERS.includes(filter) ? filter : "all",
    p_limit: Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100),
    p_offset: Math.max(Number(sp.get("offset")) || 0, 0),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { total: number }[];
  return NextResponse.json({ items: rows.map(({ total, ...r }) => r), total: rows[0] ? Number(rows[0].total) : 0 });
}
