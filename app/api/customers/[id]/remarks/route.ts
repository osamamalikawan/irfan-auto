import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { text } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit", "visits.record", "sales.create");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const text = String(b?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write a remark first." }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "Keep the remark under 500 characters." }, { status: 400 });
  const { error } = await db().from("customer_remarks").insert({ customer_id: id, text, by_user: a.user.id, by_name: a.user.name });
  if (error) return NextResponse.json({ error: error.code === "23503" ? "Customer not found." : error.message }, { status: error.code === "23503" ? 404 : 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** ?remark=<id> */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const rid = req.nextUrl.searchParams.get("remark");
  if (!rid) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await db().from("customer_remarks").delete().eq("id", rid).eq("customer_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
