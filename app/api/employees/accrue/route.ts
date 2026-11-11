import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { EMPLOYEE_COLS, postSalary, postSalaryAll, type EmployeeRow } from "@/lib/employees";
import { isUuid, todayPk } from "@/lib/field";

/** Post the salary that is due (every finished day / week / month since salary started) to the ledgers. Body: { id? } for one employee, otherwise everyone.
 *  Safe to run again: a period is only ever posted once. */
export async function POST(req: NextRequest) {
  const a = await authorize("employees.manage", "employees.pay");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const sb = db();
  try {
    if (isUuid(b?.id)) {
      const r = await sb.from("employees").select(EMPLOYEE_COLS).eq("id", b.id).maybeSingle();
      if (!r.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      return NextResponse.json({ posted: await postSalary(sb, r.data as unknown as EmployeeRow, todayPk()) });
    }
    return NextResponse.json({ posted: await postSalaryAll(sb, todayPk()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
