import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Every brand with its default discount, how many parts it has and how many customers have a special deal on it. */
export async function GET() {
  const a = await authorize("sales.discount", "settings.edit");
  if (a.error) return a.error;
  const { data, error } = await db().rpc("brand_discount_stats");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ brands: (data ?? []).map((b: any) => ({ ...b, discount_pct: Number(b.discount_pct), products: Number(b.products), deals: Number(b.deals) })) });
}
