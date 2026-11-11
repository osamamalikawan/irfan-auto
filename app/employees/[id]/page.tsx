import { redirect } from "next/navigation";
import EmployeeDetail from "@/components/EmployeeDetail";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!hasAny(await getUser(), ["employees.view", "employees.manage", "employees.pay"])) redirect("/dashboard");
  const { id } = await params;
  return <EmployeeDetail id={id} />;
}
