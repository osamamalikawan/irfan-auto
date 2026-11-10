import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { forgetMarketLists } from "@/lib/market-lists";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Hard delete a price list. Products are kept (they just have no list). ?force=1 confirms when the list still has products or routes;
 *  without it the answer is { deleted: false, needs_confirm: true, ...counts } and nothing is removed. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await authorize("settings.edit", "stock.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const { data, error } = await db().rpc("delete_price_list", { p_list: id, p_force: req.nextUrl.searchParams.get("force") === "1" });
  if (error) return dbError(error);
  if (data?.deleted) forgetMarketLists();
  return NextResponse.json(data);
}
