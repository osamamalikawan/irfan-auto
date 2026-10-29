import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

/** Remember that vouchers were printed. Body: { ids: string[] } */
export async function POST(req: NextRequest) {
  const a = await authorize("sales.create", "stock.view", "stock.transfer");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.ids) ? [...new Set<string>(b.ids.map(String))].slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sb = db();
  const cur = await sb.from("sales").select("id,dispatch_count").in("id", ids);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  for (const s of cur.data ?? []) {
    const { error } = await sb.from("sales").update({ dispatch_count: Number(s.dispatch_count) + 1, dispatch_last: new Date().toISOString() }).eq("id", s.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
