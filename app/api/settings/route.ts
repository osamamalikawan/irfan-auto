import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const KEYS = ["allow_negative_stock"] as const;

export async function GET() {
  const a = await authorize("settings.edit", "sales.create");
  if (a.error) return a.error;
  const { data, error } = await db().from("app_settings").select("key,value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out: Record<string, unknown> = { allow_negative_stock: false };
  for (const r of data ?? []) out[r.key] = r.value;
  return NextResponse.json({ settings: out });
}

/** Body: { allow_negative_stock?: boolean } */
export async function PATCH(req: NextRequest) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const rows = KEYS.filter((k) => typeof b?.[k] === "boolean").map((k) => ({ key: k, value: b[k] }));
  if (!rows.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { error } = await db().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
