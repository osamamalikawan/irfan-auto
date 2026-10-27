import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { pinError } from "@/lib/pin";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const { data, error } = await db().from("app_users")
    .select("id,name,role_id,active,location_ids,is_salesman,target_sales,target_collection,target_visits,locked_until,last_login_at,must_change_pin,role:roles(name)")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (data ?? []).map((u: any) => {
    const role = Array.isArray(u.role) ? u.role[0] : u.role;
    const { locked_until, role: _r, ...rest } = u;
    void _r;
    return { ...rest, role_name: role?.name ?? "", locked: !!locked_until && new Date(locked_until).getTime() > Date.now() };
  });
  return NextResponse.json({ users });
}

/** Body: { name, role_id, pin, active?, location_ids?, is_salesman?, target_sales?, target_collection?, target_visits? } */
export async function POST(req: NextRequest) {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const pin = String(b?.pin ?? "");
  const bad = pinError(pin);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const sb = db();
  const role = await sb.from("roles").select("id").eq("id", String(b?.role_id ?? "")).maybeSingle();
  if (!role.data) return NextResponse.json({ error: "Choose a role." }, { status: 400 });

  const { data, error } = await sb.from("app_users").insert({
    name, role_id: role.data.id, pin_hash: await bcrypt.hash(pin, 10), must_change_pin: true, active: b?.active !== false,
    location_ids: Array.isArray(b?.location_ids) && b.location_ids.length ? b.location_ids : null,
    is_salesman: !!b?.is_salesman,
    target_sales: Number(b?.target_sales) || 0, target_collection: Number(b?.target_collection) || 0, target_visits: Math.round(Number(b?.target_visits) || 0),
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A user called '" + name + "' already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
