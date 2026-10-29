import { NextResponse } from "next/server";

/** Database functions report business-rule problems with RAISE EXCEPTION (code P0001): show those messages as they are. */
export function dbError(error: { message: string; code?: string }) {
  return NextResponse.json({ error: error.message }, { status: error.code === "P0001" ? 409 : 500 });
}
