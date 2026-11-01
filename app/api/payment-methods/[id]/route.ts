import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { name?, active? }. Methods are hidden, never deleted, so old payments keep their name. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("settings.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const patch: { name?: string; active?: boolean } = {};
  if (typeof b?.name === "string") {
    const name = b.name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) return NextResponse.json({ error: "Enter a name for the payment method." }, { status: 400 });
    patch.name = name;
  }
  if (typeof b?.active === "boolean") patch.active = b.active;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const sb = db();
  if (patch.active === false) {
    const others = await sb.from("payment_methods").select("id", { count: "exact", head: true }).eq("active", true).neq("id", id);
    if (!others.count) return NextResponse.json({ error: "Keep at least one payment method visible." }, { status: 400 });
  }
  const { data, error } = await sb.from("payment_methods").update(patch).eq("id", id).select("id,name,active,sort").maybeSingle();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A payment method with that name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (!data) return NextResponse.json({ error: "Payment method not found." }, { status: 404 });
  return NextResponse.json({ method: data });
}
