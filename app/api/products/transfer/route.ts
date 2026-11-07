import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** Move products to another price list. Body: { ids: string[], list_id?: string, new_list?: string }.
 *  `new_list` creates an inactive list with that name (or uses it when it already exists). Products of an inactive list leave the Products page. */
export async function POST(req: NextRequest) {
  const a = await authorize("stock.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const ids = (Array.isArray(b?.ids) ? b.ids : []).map(String).filter((x: string) => UUID.test(x));
  if (!ids.length) return NextResponse.json({ error: "Choose at least one product." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Move at most 500 products at a time." }, { status: 400 });
  const sb = db();

  let target: { id: string; name: string; visible: boolean } | null = null;
  const newName = String(b?.new_list ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (newName) {
    const found = await sb.from("price_lists").select("id,name,visible").ilike("name", newName.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
    if (found.data) target = found.data;
    else {
      const made = await sb.from("price_lists").insert({ name: newName, visible: false }).select("id,name,visible").single();
      if (made.error) return NextResponse.json({ error: made.error.message }, { status: 500 });
      target = made.data;
    }
  } else if (typeof b?.list_id === "string" && UUID.test(b.list_id)) {
    const found = await sb.from("price_lists").select("id,name,visible").eq("id", b.list_id).maybeSingle();
    if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
    target = found.data;
  }
  if (!target) return NextResponse.json({ error: "Choose the list to move the products to." }, { status: 400 });

  const { error } = await sb.from("products").update({ list_id: target.id, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, moved: ids.length, list: target.name, inactive: !target.visible });
}
