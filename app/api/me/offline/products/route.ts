import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ?offset=0&limit=2000  The parts list for offline search: { items, total, next_offset (null = that was the last page) }. */
export async function GET(req: NextRequest) {
  const a = await authorize("orders.request", "stock.view", "sales.create");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 2000, 100), 3000);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const { data, error } = await db().rpc("inventory_list", { p_q: null, p_list: null, p_filter: "all", p_limit: limit, p_offset: offset });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { id: string; name_en: string; code_name: string | null; name_ur: string | null; scheme: string | null; cp: number; unit: string | null; brand: string | null; on_hand: number; total: number }[];
  const total = rows.length ? Number(rows[0].total) : 0;
  return NextResponse.json({
    items: rows.map((p) => ({ id: p.id, name_en: p.name_en, code_name: p.code_name, name_ur: p.name_ur, scheme: p.scheme, cp: Number(p.cp), unit: p.unit, brand: p.brand, on_hand: Number(p.on_hand) })),
    total, next_offset: offset + rows.length < total && rows.length > 0 ? offset + rows.length : null,
  });
}
