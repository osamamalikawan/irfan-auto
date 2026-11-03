import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const OK = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** The shop logo printed above the shop name on invoices. */
export async function GET() {
  const a = await authorize("sales.create", "payments.receive", "stock.view", "settings.edit");
  if (a.error) return a.error;
  const { data } = await db().from("app_settings").select("value").eq("key", "logo").maybeSingle();
  return NextResponse.json({ logo: typeof data?.value === "string" ? data.value : null });
}

/** Body: { logo: "data:image/png;base64,..." } (the Settings page shrinks the picture first) */
export async function PUT(req: NextRequest) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const logo = String(b?.logo ?? "");
  if (!OK.test(logo)) return NextResponse.json({ error: "Choose a PNG, JPG or WebP picture." }, { status: 400 });
  if (logo.length > 250_000) return NextResponse.json({ error: "The picture is too large. Use a smaller logo." }, { status: 400 });
  const { error } = await db().from("app_settings").upsert({ key: "logo", value: logo });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const { error } = await db().from("app_settings").delete().eq("key", "logo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
