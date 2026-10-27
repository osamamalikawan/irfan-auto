import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { pinError } from "@/lib/pin";
import { otherActiveAdmins } from "@/lib/users-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sb = db();

  const { data: cur } = await sb.from("app_users").select("id,role_id,active").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const newActive = b.active !== undefined ? !!b.active : cur.active;
  const newRole = b.role_id !== undefined ? String(b.role_id) : cur.role_id;
  if (id === a.user.id && !newActive) return NextResponse.json({ error: "You cannot deactivate yourself." }, { status: 400 });
  if (b.role_id !== undefined) {
    const r = await sb.from("roles").select("id").eq("id", newRole).maybeSingle();
    if (!r.data) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }

  // never leave the shop without an active administrator
  const { ids: adminRoles, count } = await otherActiveAdmins(sb, id);
  const wasAdmin = cur.active && adminRoles.includes(cur.role_id);
  const willBeAdmin = newActive && adminRoles.includes(newRole);
  if (wasAdmin && !willBeAdmin && count === 0) return NextResponse.json({ error: "Keep at least one active administrator." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    patch.name = name;
  }
  if (b.role_id !== undefined) patch.role_id = newRole;
  if (b.active !== undefined) patch.active = newActive;
  if (b.location_ids !== undefined) patch.location_ids = Array.isArray(b.location_ids) && b.location_ids.length ? b.location_ids : null;
  if (b.is_salesman !== undefined) patch.is_salesman = !!b.is_salesman;
  if (b.target_sales !== undefined) patch.target_sales = Number(b.target_sales) || 0;
  if (b.target_collection !== undefined) patch.target_collection = Number(b.target_collection) || 0;
  if (b.target_visits !== undefined) patch.target_visits = Math.round(Number(b.target_visits) || 0);
  if (b.pin) {
    const bad = pinError(String(b.pin));
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    patch.pin_hash = await bcrypt.hash(String(b.pin), 10);
    patch.must_change_pin = true;     // the person picks their own PIN at next sign-in
    patch.failed_attempts = 0; patch.locked_until = null;
  }
  if (b.unlock) { patch.failed_attempts = 0; patch.locked_until = null; }

  const { error } = await sb.from("app_users").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That name is already used." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
