import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Active payment methods for the sales and payment screens. ?all=1 (settings only) also lists hidden ones. */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.create", "payments.receive", "settings.edit");
  if (a.error) return a.error;
  const all = req.nextUrl.searchParams.get("all") === "1" && hasPerm(a.user, "settings.edit");
  let q = db().from("payment_methods").select("id,name,active,sort").order("sort").order("name");
  if (!all) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ methods: data ?? [] });
}

/** Body: { name } adds a payment method. */
export async function POST(req: NextRequest) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return NextResponse.json({ error: "Enter a name for the payment method." }, { status: 400 });
  const sb = db();
  const last = await sb.from("payment_methods").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("payment_methods").insert({ name, sort: Number(last.data?.sort ?? 0) + 10 }).select("id,name,active,sort").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A payment method with that name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ method: data }, { status: 201 });
}
