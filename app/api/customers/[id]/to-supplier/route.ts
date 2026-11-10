import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Convert a customer into a supplier: invoices become purchases, payments received become payments made, returns and the
 *  ledger move across, and the customer record is removed (all or nothing). Needs both customers.edit and suppliers.edit. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  if (!hasPerm(a.user, "suppliers.edit")) return NextResponse.json({ error: "You need permission to add suppliers too." }, { status: 403 });
  const { id } = await params;
  const { data, error } = await db().rpc("move_customer_to_supplier", { p_customer: id, p_user: a.user.id });
  if (error) return error.code === "23505" ? NextResponse.json({ error: "A supplier with this name already exists." }, { status: 409 }) : dbError(error);
  return NextResponse.json({ supplier_id: data });
}
