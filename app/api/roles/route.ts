import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { ALL_PERMS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const { data, error } = await db().from("roles").select("id,name,perms,own_only,system").order("system", { ascending: false }).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: data });
}

/** Body: { name, perms: string[], own_only } */
export async function POST(req: NextRequest) {
  const a = await authorize("users.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Role name is required." }, { status: 400 });
  const perms = Array.isArray(b?.perms) ? [...new Set((b.perms as unknown[]).map(String))].filter((p) => ALL_PERMS.includes(p)) : [];
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) + "-" + Math.random().toString(36).slice(2, 6);
  const { error } = await db().from("roles").insert({ id, name, perms, own_only: !!b?.own_only });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A role called '" + name + "' already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ id }, { status: 201 });
}
