import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** All customer groups with the number of customers in each. */
export async function GET() {
  const a = await authorize("customers.view", "customers.edit", "sales.create");
  if (a.error) return a.error;
  const sb = db();
  const [g, m] = await Promise.all([
    sb.from("customer_groups").select("id,name").order("name"),
    sb.from("customer_group_members").select("group_id").limit(100000),
  ]);
  const err = g.error ?? m.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const n = new Map<string, number>();
  for (const r of m.data ?? []) n.set(r.group_id, (n.get(r.group_id) ?? 0) + 1);
  return NextResponse.json({ groups: (g.data ?? []).map((x) => ({ ...x, customers: n.get(x.id) ?? 0 })) });
}

/** Body: { name } */
export async function POST(req: NextRequest) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });
  const { data, error } = await db().from("customer_groups").insert({ name }).select("id,name").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A group with this name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ group: { ...data, customers: 0 } }, { status: 201 });
}
