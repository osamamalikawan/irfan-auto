import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { ALL_PERMS } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const { data: role } = await sb.from("roles").select("id,system").eq("id", id).maybeSingle();
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (role.system) return NextResponse.json({ error: "The Administrator role cannot be changed." }, { status: 400 });
  const b = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (b?.name !== undefined) {
    const name = String(b.name).trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    patch.name = name;
  }
  if (Array.isArray(b?.perms)) patch.perms = [...new Set((b.perms as unknown[]).map(String))].filter((p) => ALL_PERMS.includes(p));
  if (b?.own_only !== undefined) patch.own_only = !!b.own_only;
  const { error } = await sb.from("roles").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That role name is already used." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
