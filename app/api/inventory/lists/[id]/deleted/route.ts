import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Soft-deleted products of one list, so they can be restored. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("stock.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const { data, error } = await db().from("products").select("id,name_en,name_ur,code_name,cp,scheme,updated_at").eq("list_id", id).eq("active", false).order("name_en").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
