import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** All price lists with product counts and visibility. */
export async function GET() {
  const { data, error } = await db().rpc("price_list_stats");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lists: (data ?? []).map((l: { products: number }) => ({ ...l, products: Number(l.products) })) });
}

/** Body: { id, visible }  or  { all: true, visible }  */
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
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
