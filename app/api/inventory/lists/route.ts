import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { forgetMarketLists } from "@/lib/market-lists";

export const dynamic = "force-dynamic";

/** All price lists with product counts and visibility. */
export async function GET() {
  const a = await authorize("stock.view", "settings.edit", "stock.manage");
  if (a.error) return a.error;
  const { data, error } = await db().rpc("price_list_stats");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lists: (data ?? []).map((l: { products: number }) => ({ ...l, products: Number(l.products) })) });
}

/** Body: { id, visible }  or  { all: true, visible }  or  { id, is_market } */
export async function PATCH(req: NextRequest) {
  const a = await authorize("settings.edit", "stock.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (typeof b?.is_market === "boolean" && typeof b.id === "string") {
    const r = await db().from("price_lists").update({ is_market: b.is_market }).eq("id", b.id);
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    forgetMarketLists();
    return NextResponse.json({ ok: true });
  }
  if (typeof b?.visible !== "boolean") return NextResponse.json({ error: "visible must be true or false" }, { status: 400 });
  const base = db().from("price_lists").update({ visible: b.visible });
  let q: typeof base;
  if (b.all === true) q = base.not("id", "is", null);
  else if (typeof b.id === "string") q = base.eq("id", b.id);
  else return NextResponse.json({ error: "Give a list id, or all: true" }, { status: 400 });
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
