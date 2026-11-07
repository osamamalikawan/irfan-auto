import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Everything the Products page filters and edit form need. Lists include the inactive ones (visible = false) so products can be moved there. */
export async function GET() {
  const a = await authorize("stock.view", "stock.manage");
  if (a.error) return a.error;
  const sb = db();
  const [lists, companies, brands, suppliers] = await Promise.all([
    sb.from("price_lists").select("id,name,visible").order("name"),
    sb.from("companies").select("id,name").order("name"),
    sb.from("brands").select("id,name").order("name"),
    sb.from("suppliers").select("id,name,status").order("name"),
  ]);
  const err = lists.error ?? companies.error ?? brands.error ?? suppliers.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    lists: lists.data, companies: companies.data, brands: brands.data,
    suppliers: (suppliers.data ?? []).filter((s) => s.status === "active").map(({ id, name }) => ({ id, name })),
  });
}
