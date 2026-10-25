import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { location_id, type: "receive" | "issue" | "adjust", qty, note? }
 *  receive = +|qty|, issue = -|qty|, adjust = signed qty as sent (used for stock counts). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const q = Number(b?.qty);
  if (!b?.location_id || !Number.isFinite(q) || q === 0) return NextResponse.json({ error: "Choose a location and enter a quantity" }, { status: 400 });
  const type = b.type;
  if (!["receive", "issue", "adjust"].includes(type)) return NextResponse.json({ error: "Bad type" }, { status: 400 });
  const signed = type === "receive" ? Math.abs(q) : type === "issue" ? -Math.abs(q) : q;
  const { data, error } = await db().rpc("adjust_stock", {
    p_product: id, p_location: b.location_id, p_qty: signed, p_type: type, p_note: String(b.note ?? "").slice(0, 200),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ qty: Number(data) });
}
