import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = db();
  const [lists, locations, companies, brands] = await Promise.all([
    sb.from("price_lists").select("id,name").order("name"),
    sb.from("locations").select("id,name").eq("active", true).order("name"),
    sb.from("companies").select("name").order("name"),
    sb.from("brands").select("name").order("name"),
  ]);
  const err = lists.error ?? locations.error ?? companies.error ?? brands.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    lists: lists.data, locations: locations.data,
    companies: companies.data!.map((c) => c.name), brands: brands.data!.map((b) => b.name),
  });
}
