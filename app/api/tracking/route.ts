import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Every active salesman with his last known position, how old it is, battery, and whether he is on duty today. */
export async function GET() {
  const a = await authorize("tracking.view");
  if (a.error) return a.error;
  const { data, error } = await db().rpc("salesman_locations");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], now: new Date().toISOString() });
}
