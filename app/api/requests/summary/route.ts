import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** How many requests wait for the office: { orders, payments, returns, total }. For the badge on the approvals menu. */
export async function GET() {
  const a = await authorize("requests.approve");
  if (a.error) return a.error;
  const sb = db();
  const count = async (table: string) => (await sb.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0;
  const [orders, payments, returns] = await Promise.all([count("order_requests"), count("payment_requests"), count("return_requests")]);
  return NextResponse.json({ orders, payments, returns, total: orders + payments + returns });
}
