import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { getThresholds } from "@/lib/performance";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await authorize("settings.edit", "sales.create");
  if (a.error) return a.error;
  const sb = db();
  const { data, error } = await sb.from("app_settings").select("key,value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out: Record<string, unknown> = { allow_negative_stock: false };
  for (const r of data ?? []) if (r.key !== "logo") out[r.key] = r.value;
  out.thresholds = await getThresholds(sb);
  return NextResponse.json({ settings: out });
}

/** Body: { allow_negative_stock?: boolean, thresholds?: { red, green } }  red/green = percent of target */
export async function PATCH(req: NextRequest) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const rows: { key: string; value: unknown }[] = [];
  if (typeof b?.allow_negative_stock === "boolean") rows.push({ key: "allow_negative_stock", value: b.allow_negative_stock });
  if (b?.thresholds) {
    const red = Math.round(Number(b.thresholds.red)), green = Math.round(Number(b.thresholds.green));
    if (!(red >= 1 && red <= 99)) return NextResponse.json({ error: "Red must be between 1 and 99 percent." }, { status: 400 });
    if (!(green > red && green <= 200)) return NextResponse.json({ error: "Green must be above red and at most 200 percent." }, { status: 400 });
    rows.push({ key: "thresholds", value: { red, green } });
  }
  if (!rows.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { error } = await db().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
