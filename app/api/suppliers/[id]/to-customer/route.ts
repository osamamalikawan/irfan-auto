import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Move a supplier to the customers list: details are copied to a new customer (no route yet) and the supplier is archived.
 *  Refused while the supplier has a balance or open purchase orders. Needs both suppliers.edit and customers.edit. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.edit");
  if (a.error) return a.error;
  if (!hasPerm(a.user, "customers.edit")) return NextResponse.json({ error: "You need permission to add customers too." }, { status: 403 });
  const { id } = await params;
  const { data, error } = await db().rpc("move_supplier_to_customer", { p_supplier: id });
  if (error) return dbError(error);
  return NextResponse.json({ customer_id: data });
}
