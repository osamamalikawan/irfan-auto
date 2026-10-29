import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The shop's cash customer, used for walk-in sales. */
export async function GET() {
  const a = await authorize("sales.create", "payments.receive", "customers.view");
  if (a.error) return a.error;
  const { data, error } = await db().from("customers").select("id,name,code").eq("is_walk_in", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Walk-in customer is missing. Run 0006_customers_routes.sql." }, { status: 404 });
  return NextResponse.json({ customer: data });
}
