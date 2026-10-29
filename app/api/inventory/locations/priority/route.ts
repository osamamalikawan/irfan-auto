import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

/** Which location stock is sold from first. Body: { ids: [location ids, first = sold from first] } */
export async function POST(req: NextRequest) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.ids) ? b.ids.map(String) : [];
  if (!ids.length) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sb = db();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await sb.from("locations").update({ sell_priority: (i + 1) * 10 }).eq("id", ids[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
