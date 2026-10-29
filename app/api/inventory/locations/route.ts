import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { rackCodes, rackPrefix } from "@/lib/placement";

export const dynamic = "force-dynamic";
const LOCATION_TYPES = ["Shop", "Godown", "Warehouse", "Damaged stock"];

export async function GET() {
  const a = await authorize("stock.view", "stock.manage", "users.manage", "settings.edit");
  if (a.error) return a.error;
  const { data, error } = await db().from("locations").select("id,name,type,active,sell_priority,racks(count)").order("sell_priority").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ locations: (data ?? []).map((l: any) => ({ id: l.id, name: l.name, type: l.type, active: l.active, racks: l.racks?.[0]?.count ?? 0, sell_priority: l.sell_priority })) });
}

/** Body: { name, type, racks (0-500), prefix? }  Same fields as the prototype's "Add stock location". */
export async function POST(req: NextRequest) {
  const a = await authorize("stock.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Location name is required." }, { status: 400 });
  const type = LOCATION_TYPES.includes(b?.type) ? b.type : "Godown";
  const parsed = parseInt(String(b?.racks ?? "0"), 10);
  const count = Number.isFinite(parsed) ? parsed : 0;
  if (count < 0 || count > 500) return NextResponse.json({ error: "Enter a rack count between 0 and 500." }, { status: 400 });
  const prefix = String(b?.prefix ?? "").trim().slice(0, 6) || rackPrefix(name);

  const sb = db();
  const dup = await sb.from("locations").select("id").ilike("name", name.replace(/[\\%_]/g, "\\$&")).limit(1);
  if (dup.error) return NextResponse.json({ error: dup.error.message }, { status: 500 });
  if (dup.data?.length) return NextResponse.json({ error: "A location called '" + name + "' already exists." }, { status: 409 });

  const { data: loc, error } = await sb.from("locations").insert({ name, type }).select("id,name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (count > 0) {
    const r = await sb.from("racks").insert(rackCodes(prefix, count).map((code) => ({ location_id: loc.id, code })));
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  return NextResponse.json({ id: loc.id, name: loc.name, racks: count, prefix }, { status: 201 });
}
