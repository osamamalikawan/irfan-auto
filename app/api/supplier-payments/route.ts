import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";

/** Pay a supplier. Body: { supplier_id, amount, method: cash|bank|cheque, ref?, note?, idem_key? } */
export async function POST(req: NextRequest) {
  const a = await authorize("suppliers.pay");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.supplier_id) return NextResponse.json({ error: "Choose a supplier." }, { status: 400 });
  const { data, error } = await db().rpc("pay_supplier", {
    p_supplier: b.supplier_id, p_amount: Number(b.amount), p_method: String(b.method ?? "cash"), p_ref: String(b.ref ?? "").slice(0, 60),
    p_note: String(b.note ?? "").slice(0, 300), p_idem: b.idem_key ? String(b.idem_key) : null, p_user: a.user.id,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
