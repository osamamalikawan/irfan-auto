import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Active suppliers, names only (no balances), for choosing who a market purchase was bought from. */
export async function GET() {
  const a = await authorize("sales.create", "suppliers.view", "suppliers.edit", "purchases.create", "stock.manage");
  if (a.error) return a.error;
  const { data, error } = await db().from("suppliers").select("id,name,name_ur").eq("status", "active").order("name").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suppliers: data ?? [] });
}
