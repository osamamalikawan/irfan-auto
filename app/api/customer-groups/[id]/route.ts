import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Rename a group. Body: { name } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });
  const { error } = await db().from("customer_groups").update({ name }).eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A group with this name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}

/** Delete a group. Customers stay; they only lose this group. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const { error } = await db().from("customer_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
