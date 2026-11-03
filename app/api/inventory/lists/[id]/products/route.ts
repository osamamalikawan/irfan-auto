import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Products of one list for the list screen and the list print. ?q=&offset=&limit=  (purchase price only for people allowed to see it) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("stock.view", "stock.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 500);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const q = (sp.get("q") ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 60);
  const withPP = hasAny(a.user, ["stock.manage", "purchases.create"]);
  let query = db().from("products").select("id,name_en,name_ur,code_name,cp,purchase_price,scheme,unit", { count: "exact" }).eq("list_id", id).eq("active", true);
  if (q) query = query.or(`name_en.ilike.%${q}%,name_ur.ilike.%${q}%,code_name.ilike.%${q}%`);
  const { data, count, error } = await query.order("name_en").range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data ?? []).map(({ purchase_price, ...p }: { purchase_price: number | null }) => (withPP ? { ...p, purchase_price: Number(purchase_price ?? 0) } : p));
  return NextResponse.json({ items, total: count ?? items.length, can_see_pp: withPP });
}
