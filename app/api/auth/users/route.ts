import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Names only, for the sign-in list. */
export async function GET() {
  const { data, error } = await db().from("app_users").select("id,name").eq("active", true).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}
