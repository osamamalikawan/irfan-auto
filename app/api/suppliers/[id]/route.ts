import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const TEXT = ["name_ur", "contact", "phone", "phone2", "address", "city", "ntn", "email", "notes"] as const;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.view", "suppliers.edit", "suppliers.pay", "purchases.create");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const [s, bal, pur] = await Promise.all([
    sb.from("suppliers").select("*").eq("id", id).maybeSingle(),
    sb.from("supplier_balances").select("balance").eq("supplier_id", id).maybeSingle(),
    sb.from("purchases").select("id,no,purchase_date,total,paid,status,supplier_inv_no").eq("supplier_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  if (!s.data) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  return NextResponse.json({ supplier: { ...s.data, balance: Number(bal.data?.balance ?? 0) }, purchases: pur.data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) {
    const name = String(b.name).trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    patch.name = name;
  }
  for (const k of TEXT) if (b[k] !== undefined) patch[k] = String(b[k]).trim() || null;
  if (b.credit_days !== undefined) patch.credit_days = Math.max(0, Math.round(Number(b.credit_days) || 0));
  if (b.status !== undefined) {
    if (!["active", "archived"].includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
  }
  const { error } = await db().from("suppliers").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That name is already used." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
